import { spawn, type ChildProcess } from "node:child_process";
import { prisma } from "@financemanager/db";

export const PORT = Number(process.env.API_TEST_PORT ?? 3399);
export const BASE = `http://127.0.0.1:${PORT}/api/v1`;

let server: ChildProcess | undefined;

/**
 * Boot the REAL compiled server and drive it over HTTP.
 *
 * In-process supertest would be faster, but NestJS's DI needs decorator
 * metadata that esbuild (and so vitest's transform) does not emit. Testing the
 * built artifact over the wire sidesteps that entirely — and it is also what
 * the exit criteria actually care about: what a phone gets back, including the
 * guards, the interceptors and the JSON serialisation.
 */
export async function startServer(): Promise<void> {
  server = spawn("node", ["dist/apps/api/src/main.js"], {
    // vitest runs from the package root, which is where dist/ lives.
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(PORT) },
    stdio: "pipe",
  });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/accounts`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("API did not start in time");
}

export async function stopServer() {
  server?.kill("SIGTERM");
  await prisma.$disconnect();
}

/** Wipe every table so a run is independent of whatever ran before it. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "RefreshToken", "SyncCursor", "SyncOperation", "SyncConflict",
      "HouseholdKey", "Device", "Transaction", "RecurringTransaction", "Budget",
      "Investment", "Account", "Category", "Invitation", "Membership",
      "Household", "User" RESTART IDENTITY CASCADE
  `);
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
  households: { id: string; name: string; role: string }[];
}

export async function api(
  path: string,
  opts: { token?: string; household?: string; method?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.household) headers["X-Household-Id"] = opts.household;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export async function register(email: string, name = email.split("@")[0]): Promise<Session> {
  const res = await api("/auth/register", {
    body: { name, email, password: "password123", baseCurrency: "USD" },
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as Session;
}
