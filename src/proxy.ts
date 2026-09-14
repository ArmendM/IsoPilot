import { NextResponse, type NextRequest } from "next/server";

// Grobfilter (in Next 16 heisst die Middleware-Konvention "proxy"): ohne Cookie gar nicht erst in die App. Die eigentliche Prüfung
// passiert in getSession(), weil die Middleware keine Datenbank sieht.
// /api/cron schützt sich selbst über x-cron-secret. Ohne Ausnahme hier
// würde der nächtliche Timer auf /login umgeleitet und nie etwas tun.
const PUBLIC = [
  "/login",
  "/api/auth",
  "/api/health",
  "/api/cron",
  "/_next",
  // Die Symbole und die Marke. Sie stehen im Kopf jeder Seite, also auch
  // im Kopf der Anmeldeseite. Ohne Ausnahme hier holte der Browser sie
  // ohne Sitzung nicht, bekäme die Anmeldeseite als Antwort und zeigte
  // ein leeres Symbol, bevor sich überhaupt jemand angemeldet hat.
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/marke/",
];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!req.cookies.get("sid")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
