import { NextResponse, type NextRequest } from "next/server";
import { refreshAll } from "@/lib/marketdata";

// Scheduled market-data refresh endpoint.
// Point a scheduler at this (Vercel Cron, GitHub Actions, system cron, …):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/refresh
//
// Refreshes FX rates and EVERY user's investment prices (no userId scope).
// Protected by the CRON_SECRET env var; if unset, the endpoint is disabled.

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Allow ?secret= for schedulers that can't set headers.
  return req.nextUrl.searchParams.get("secret") === secret;
}

async function handle(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const summary = await refreshAll();
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
