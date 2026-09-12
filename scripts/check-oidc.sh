#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Prüft, ob Client-ID und Secret beim IdP akzeptiert werden,
# ohne dass du dich im Browser anmelden musst.
#
#   ./scripts/check-oidc.sh [pfad-zur-env]      Vorgabe: .env
#
# Es wird absichtlich ein ungültiger Code eingelöst. Interessant ist
# nicht, dass das scheitert, sondern woran:
#   invalid_grant   → Zugangsdaten in Ordnung, nur der Code war falsch
#   invalid_client  → Client-ID oder Secret stimmen nicht
# ══════════════════════════════════════════════════════════════
set -euo pipefail

ENVFILE="${1:-.env}"
[ -r "$ENVFILE" ] || { echo "Nicht lesbar: $ENVFILE"; exit 1; }

val() { # val <schluessel> — Wert aus der env-Datei, ohne Anführungszeichen
  sed -n "s/^$1=//p" "$ENVFILE" | head -1 | sed 's/^"//;s/"$//'
}

ISSUER=$(val OIDC_ISSUER)
CID=$(val OIDC_CLIENT_ID)
CSEC=$(val OIDC_CLIENT_SECRET)
REDIR=$(val OIDC_REDIRECT_URI)

[ -n "$ISSUER" ] || { echo "OIDC_ISSUER fehlt in $ENVFILE"; exit 1; }
[ -n "$CID" ]    || { echo "OIDC_CLIENT_ID fehlt in $ENVFILE"; exit 1; }

echo "Issuer:       $ISSUER"
echo "Client-ID:    $CID"
echo "Weiterleitung: $REDIR"
if [ -z "$CSEC" ]; then
  echo "Secret:       nicht gesetzt, Anfrage als öffentlicher Client"
elif [[ "$CSEC" == http* ]]; then
  echo "Secret:       sieht aus wie eine URL. Da gehört das Client Secret hin,"
  echo "              nicht die Weiterleitungs-URL."
else
  echo "Secret:       gesetzt, ${#CSEC} Zeichen"
fi

# Infomaniak liefert die URLs mit maskierten Schrägstrichen, die müssen weg.
TOKEN_EP=$(curl -fsS "$ISSUER/.well-known/openid-configuration" \
  | sed -n 's/.*"token_endpoint":"\([^"]*\)".*/\1/p' \
  | sed 's|\\/|/|g')
[ -n "$TOKEN_EP" ] || { echo "Discovery fehlgeschlagen bei $ISSUER"; exit 1; }
echo "Token-Endpunkt: $TOKEN_EP"
echo

# ── 1. Ist die Weiterleitungs-URL beim IdP hinterlegt? ────────
AUTH_EP=$(curl -fsS "$ISSUER/.well-known/openid-configuration" \
  | sed -n 's/.*"authorization_endpoint":"\([^"]*\)".*/\1/p' \
  | sed 's|\\/|/|g')

enc() { python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=''))" "$1"; }

AUTH_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
  "$AUTH_EP?response_type=code&client_id=$(enc "$CID")&redirect_uri=$(enc "$REDIR")&scope=openid+email+profile&state=pruefung&nonce=pruefung&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256")

case "$AUTH_CODE" in
  30*)
    echo "Weiterleitungs-URL: hinterlegt (HTTP $AUTH_CODE)"
    ;;
  400)
    echo "Weiterleitungs-URL: NICHT hinterlegt (HTTP 400)"
    echo
    echo "Der IdP lehnt die Anfrage mit \"Invalid request parameter:"
    echo "redirect_uri\" ab. Trage im Infomaniak Manager bei dieser"
    echo "Anwendung genau diese URL nach:"
    echo "  $REDIR"
    echo "Client-ID der Anwendung: $CID"
    exit 1
    ;;
  *)
    echo "Weiterleitungs-URL: unerwartete Antwort HTTP $AUTH_CODE"
    exit 1
    ;;
esac
echo

# ── 2. Werden die Zugangsdaten akzeptiert? ────────────────────
ARGS=(
  --data-urlencode "grant_type=authorization_code"
  --data-urlencode "code=absichtlich-ungueltig"
  --data-urlencode "redirect_uri=$REDIR"
  --data-urlencode "client_id=$CID"
  --data-urlencode "code_verifier=absichtlich-ungueltiger-verifier-mit-genug-laenge"
)
[ -n "$CSEC" ] && ARGS+=(--data-urlencode "client_secret=$CSEC")

BODY=$(curl -sS -X POST "$TOKEN_EP" \
  -H "content-type: application/x-www-form-urlencoded" "${ARGS[@]}")

echo "Antwort: $BODY"
echo
case "$BODY" in
  *invalid_grant*)
    echo "In Ordnung. Der IdP hat den Client akzeptiert und nur den Code"
    echo "abgelehnt, und der war absichtlich falsch. Die Anmeldung im"
    echo "Browser sollte jetzt durchlaufen."
    ;;
  *invalid_client*)
    if [ -n "$CSEC" ]; then
      echo "Client-ID oder Secret stimmen nicht. Möglich ist auch, dass die"
      echo "Anwendung im Manager ein öffentlicher Client ist, der gar kein"
      echo "Secret erwartet. Dann diese Prüfung ohne Secret wiederholen."
    else
      echo "Der IdP erwartet eine Client-Authentisierung. Die Anwendung ist"
      echo "also ein vertraulicher Client, das Secret fehlt in $ENVFILE."
    fi
    exit 1
    ;;
  *)
    echo "Unerwartete Antwort. Prüfe Issuer und Weiterleitungs-URL."
    exit 1
    ;;
esac
