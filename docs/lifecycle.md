# Baustellen-Lebenszyklus

Von der Anfrage bis zur bezahlten Rechnung. Dieses Dokument ist die
Grundlage für M6 und M7 und ergänzt `CLAUDE.md`.

## Status

```
                    ┌──────────┐
   Anfrage  ───────▶│ OFFERTE  │
                    └────┬─────┘
                         │  gewonnen          verloren
                         ├─────────────▶ AUFTRAG    └──▶ VERLOREN
                         │
                    ┌────▼─────┐  Termin und Personen gesetzt
                    │ AUFTRAG  ├──────────────▶ GEPLANT
                    └──────────┘
                                  erste Zeit erfasst
                         GEPLANT ────────────▶ IN_ARBEIT
                                  Arbeiten fertig
                      IN_ARBEIT ────────────▶ AUSGEFUEHRT
                                  Rechnung gestellt
                    AUSGEFUEHRT ────────────▶ VERRECHNET
                                  Zahlung eingegangen
                     VERRECHNET ────────────▶ ABGESCHLOSSEN

   Nebenzustände aus jedem Status: PAUSIERT, STORNIERT
```

| Status | Bedeutung | Was möglich ist |
|---|---|---|
| `OFFERTE` | Anfrage erhalten, Offerte in Arbeit | Material als Offertposition erfassen, Offerte erzeugen und senden |
| `VERLOREN` | Auftrag nicht erhalten | nur lesen, zählt in die Offertquote |
| `AUFTRAG` | Zuschlag erhalten, noch nicht terminiert | Termin und Personen planen |
| `GEPLANT` | Termin und Mannschaft stehen, Start liegt in der Zukunft | erscheint im Planungskalender |
| `IN_ARBEIT` | Es wird gearbeitet | Zeiten und Materialverbrauch buchen |
| `AUSGEFUEHRT` | Arbeiten fertig, Rückzug möglich | Materialrückzug, Rechnung vorbereiten |
| `VERRECHNET` | Rechnung gestellt | Zahlungsüberwachung, Mahnung |
| `ABGESCHLOSSEN` | Bezahlt | nur lesen |
| `PAUSIERT` | Baustopp, Winterpause | keine Buchungen |
| `STORNIERT` | Auftrag entfallen | nur lesen |

**Statuswechsel sind nicht frei wählbar.** Erlaubte Übergänge stehen in einer
Tabelle im Code, jeder Wechsel landet mit Person, Zeitpunkt und optionalem
Grund im `SiteStatusEvent`. `IN_ARBEIT` wird automatisch gesetzt, sobald die
erste Zeit gebucht wird, das muss niemand von Hand tun.

## Material in drei Schichten

Das ist der Kern und muss sauber getrennt bleiben:

| Schicht | `kind` | Entsteht | Wirkung Lager | Wirkung Rechnung |
|---|---|---|---|---|
| Offertposition | `OFFER` | in der Offertphase | keine | Grundlage der Offerte |
| Verbrauch | `CONSUMPTION` | beim Arbeiten | Abgang | nur die Menge über der Offerte als Nachtrag |
| Rückzug | `RETURN` | beim Abschliessen | Zugang | standardmässig **keine** Gutschrift |

**Nachtrag:** Sobald die Baustelle aus `OFFERTE` heraus ist, wird pro Artikel
verglichen. Verbrauch über der Offertmenge erscheint auf der Baustelle als
eigener Block "Nachtrag", farblich abgesetzt, mit Menge und Betrag. Das ist
die Zahl, die den Deckungsbeitrag frisst, und sie muss sichtbar sein, bevor
die Rechnung gestellt wird.

**Rückzug:** Übriges Material geht zurück ins Lager, die Lagerbewegung trägt
den Vermerk "Rückzug aus Baustelle X". Standardmässig `billable = true`, das
heisst der Kunde zahlt wie offeriert. Erst wenn jemand bewusst "nicht
verrechnen" wählt, wird gutgeschrieben. Diese Entscheidung wird protokolliert,
damit später nachvollziehbar ist, wer eine Gutschrift veranlasst hat.

## Kleinmengenzuschlag

Nicht als Artikel im Katalog, sondern als Regel am Material:

```
Material.smallQtyThreshold   Decimal?   // 30
Material.smallQtySurcharge   Decimal?   // 2.00, bei Alublech 5.00
```

Beim Erfassen einer Position wird geprüft, ob die Menge **je Baustelle und
Artikel** unter der Schwelle liegt. Ist sie es, erscheint direkt im Formular
ein Hinweis und der Betrag wird erhöht. Auf der Baustelle und in der Offerte
steht der Zuschlag als eigene Zeile, nicht versteckt im Einzelpreis.

Wichtig: Die Schwelle gilt kumuliert. Wer dreimal 12 m2 Armaflex bucht, hat
36 m2 und damit keinen Zuschlag mehr. Der Zuschlag wird deshalb bei jeder
Buchung neu berechnet, nicht einmal beim Erfassen eingefroren.

## Regiearbeit

Zwei Ergänzungen:

```
User.regieTariff       "A" | "B"   // Isoleur A = 84.-/h, B = 76.-/h
TimeEntry.billingMode  PAUSCHAL | REGIE
```

Standard ist `PAUSCHAL`, also im Offertpreis enthalten. Vorgesetzte können
auf der Baustelle einzelne Zeiteinträge oder einen ganzen Tag auf `REGIE`
umstellen, mit Mehrfachauswahl wie im Materialkatalog. Regiestunden erscheinen
auf der Baustelle als eigener Block mit Betrag und landen als separate
Positionen auf der Rechnung.

Die Tarife stehen in den Firmeneinstellungen mit Gültigkeitsdatum, nicht im
Materialkatalog. Eine Tariferhöhung darf alte Baustellen nicht rückwirkend
verändern, deshalb wird der Ansatz bei der Rechnungsstellung eingefroren.

## Planung

```
Site.plannedStart   Date?
Site.plannedEnd     Date?
Site.deadline       Date?
SiteAssignment      { siteId, userId, fromDate, toDate }
DeadlineChange      { siteId, oldDate, newDate, reason, actorId, at }
```

Der bestehende Kalender bekommt eine zweite Ebene: neben Ferien, Krankheit
und Feiertagen die geplanten Baustellen je Person, als farbiger Balken.
Wer für eine Baustelle eingeplant ist, sieht sie auf der Startseite als
"heute vorgesehen" und findet sie bei der Zeiterfassung zuoberst.

**Deadline nur mit Begründung änderbar.** Das Feld ist nicht einfach
beschreibbar: Beim Ändern verlangt die App einen Grund, alte und neue Frist
werden festgehalten. Bei Terminstreit mit einem Auftraggeber ist das die
Unterlage, die zählt.

**Konfliktprüfung:** Wird jemand für eine Baustelle eingeplant, der in diesem
Zeitraum Ferien hat, warnt die App. Sie verhindert es nicht, Baustellen
verschieben sich nun einmal, aber sie sagt es.

## Offerte

```
Offer {
  id, siteId, number, version, status DRAFT|SENT|ACCEPTED|REJECTED|EXPIRED
  validUntil, discountPct, subtotal, vatRate, total
  pdfPath, sentAt, sentTo, acceptedAt, createdById
}
OfferLine { offerId, sortOrder, description, quantity, unit, unitPrice, amount, sourceBookingId? }
```

Ablauf: Material in der Offertphase erfassen, dann "Offerte erzeugen". Die
Positionen werden aus den `OFFER`-Buchungen gebildet, Kleinmengenzuschläge
als eigene Zeilen ergänzt, das Ergebnis als PDF abgelegt und per Mail
versendet. Beim Versand wechselt die Offerte auf `SENT`.

**Versionierung statt Überschreiben.** Eine nachträglich geänderte Offerte
bekommt Version 2, Version 1 bleibt im Dateisystem. Sonst weiss später
niemand mehr, worauf sich der Kunde bezogen hat.

Inhalt des PDF: Logo und Firmenangaben aus den Einstellungen, Objektadresse,
Partnerfirma, Positionen mit Menge, Einheit, Einzelpreis und Betrag,
Zwischensumme, allfälliger Objektrabatt, MwSt., Total, Gültigkeitsdauer,
Konditionen "10 Tage 2 % Skonto, 30 Tage netto".

## Rechnung

```
Invoice {
  id, siteId, number, status DRAFT|SENT|PARTIALLY_PAID|PAID|OVERDUE|CANCELLED
  issuedAt, dueDate, discountDeadline, discountPct
  subtotal, vatRate, total, paidAmount, paidAt
  qrReference, pdfPath, sentAt, sentTo
}
InvoiceLine { invoiceId, sortOrder, kind OFFER|NACHTRAG|REGIE|MATERIAL, description, quantity, unit, unitPrice, amount }
Payment { invoiceId, amount, valueDate, note, enteredById }
```

Die Rechnung entsteht aus vier Quellen: Offertpositionen, Nachträge,
Regiestunden und allfälligen Gutschriften für nicht verrechneten Rückzug.
Vor dem Erzeugen zeigt die App eine Vorschau mit genau dieser Aufteilung.

**Drei Regeln, die nicht verhandelbar sind:**

1. Rechnungsnummern sind fortlaufend und lückenlos. Eine Nummer wird erst
   beim Wechsel von `DRAFT` auf `SENT` vergeben.
2. Eine gestellte Rechnung wird nie geändert. Korrektur heisst stornieren
   und neu ausstellen, beide bleiben erhalten.
3. Das PDF wird beim Versand gespeichert und nicht neu erzeugt. Wer später
   eine Kopie anfordert, bekommt exakt das versendete Dokument.

**QR-Rechnung:** Schweizer Rechnungen brauchen den QR-Zahlteil mit
Swiss QR Code, IBAN oder QR-IBAN und strukturierter Referenz. Ohne das
kann der Kunde nicht bequem zahlen und ihr könnt Zahlungseingänge nicht
automatisch zuordnen. Dafür gibt es fertige Bibliotheken, es ist aber ein
eigener Arbeitsschritt mit eigenen Formatvorschriften.

**Zahlungseingang:** Wird von Hand erfasst, mit Betrag und Valutadatum.
Ein automatischer Abgleich über camt.054 vom Bankkonto wäre möglich, gehört
aber frühestens in eine spätere Ausbaustufe.

## Was das für die Buchhaltung bedeutet

IsoPilot erzeugt und versendet Dokumente und überwacht Zahlungseingänge.
**Es ersetzt keine Buchhaltung.** MwSt.-Abrechnung, Debitorenbuchhaltung
und Jahresabschluss bleiben beim Treuhänder beziehungsweise in eurem
bestehenden Werkzeug. IsoPilot liefert dorthin einen Export.

Diese Grenze bewusst zu ziehen ist wichtig. Sobald eine Software Rechnungen
stellt, entstehen Aufbewahrungs- und Nachvollziehbarkeitspflichten. Eine
Buchhaltung zusätzlich selbst zu bauen wäre ein eigenes Projekt in der
Grössenordnung des jetzigen.

## Vorgeschlagene Reihenfolge

| Stufe | Inhalt | Aufwand |
|---|---|---|
| **M6a** | EI-Klasse als Feld, Kleinmengenzuschlag als Regel, Regiekennzeichen an Zeiteinträgen | klein |
| **M6b** | Statusmodell mit Übergangstabelle und Protokoll, Nachtragsanzeige | mittel |
| **M6c** | Planung: Termin, Deadline mit Begründung, Personenzuteilung, Kalenderebene | mittel |
| **M7a** | Offerte: Positionen, PDF, Versand, Versionierung | gross |
| **M7b** | Materialrückzug mit Lagerbuchung und Verrechnungsentscheid | mittel |
| **M7c** | Rechnung mit QR-Zahlteil, Versand, Zahlungseingang, Mahnwesen | gross |

Realistisch sind das 120 bis 200 zusätzliche Stunden. Das verdoppelt den
Projektumfang gegenüber dem heutigen Plan.

**Empfehlung:** M6a und M6b vor dem Produktivstart, der Rest danach.
Zeiterfassung, Baustellen und Material müssen erst einen Monat im
Parallelbetrieb bewiesen haben, bevor Offerten und Rechnungen dazukommen.
Wenn die Zeiterfassung noch wackelt und gleichzeitig Rechnungen darüber
laufen, wird jeder Fehler teuer statt nur ärgerlich.

## Offene Entscheidungen

- Rechnungsnummernkreis: pro Jahr neu, etwa `2026-001`, oder fortlaufend?
- MwSt.-Satz und Abrechnungsart, Saldosteuersatz oder effektiv?
- Wird das Offert-PDF vom Kunden unterschrieben zurückgesendet, oder genügt
  eine mündliche Zusage? Davon hängt ab, ob ein Feld für das Rückdokument
  gebraucht wird.
- Sollen Mitarbeitende die Offertsummen sehen oder nur Vorgesetzte?
- Wie heisst "Regiearbeit" bei euch gegenüber dem Kunden? Regie, Stundenlohn
  oder Aufwand?
