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

/** Set the session cookie (call from a Server Action / Route Handler). */
export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
