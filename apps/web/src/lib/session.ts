import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  verifySessionToken,
  MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "./jwt";

// Cookie-bound session helpers for use in Server Components / Actions.
// The JWT primitives live in ./jwt so Middleware can share them.

export type { SessionPayload } from "./jwt";

/**
 * Should the session cookie carry the `Secure` flag?
 *
 * Secure cookies are only sent over HTTPS, which is what we want for any
 * internet-facing deployment. Browsers also treat `http://localhost` as a
 * secure context, so an SSH tunnel works with this on.
 *
 * It does NOT work when the app is reached over plain HTTP at a private
 * hostname or LAN/VPN address (e.g. http://10.8.0.1:3000) — the browser
 * withholds the cookie and the user is bounced back to the login page.
 *
 * For a deployment that is reachable ONLY over a private network and never
 * from the internet, set `COOKIE_SECURE=false`. Do not set it on a
 * publicly-reachable instance: the session token would travel in clear text.
 */
function shouldUseSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

/** Set the session cookie (call from a Server Action / Route Handler). */
export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Read + verify the current session, or null if not logged in. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
