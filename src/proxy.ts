import { NextResponse, type NextRequest } from "next/server";

// Grobfilter (in Next 16 heisst die Middleware-Konvention "proxy"): ohne Cookie gar nicht erst in die App. Die eigentliche Prüfung
// passiert in getSession(), weil die Middleware keine Datenbank sieht.
const PUBLIC = ["/login", "/api/auth", "/api/health", "/_next", "/favicon.ico"];

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
