import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/jwt";

// Protect the app routes. Unauthenticated users hitting a protected page are
// redirected to /login; logged-in users hitting /login or /register are sent
// to the dashboard.

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/recurring",
  "/budgets",
  "/investments",
  "/accounts",
  "/settings",
];
const AUTH_PAGES = ["/login", "/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isProtected && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // run on everything except static assets & api
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
