import { NextResponse, type NextRequest } from "next/server";
import { refreshBankSync } from "@/lib/plaid";

// Scheduled bank-sync endpoint.
// Point a scheduler at this (Vercel Cron, GitHub Actions, system cron, …):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/bank-sync
//
// Syncs every linked PlaidItem for EVERY household. Protected by CRON_SECRET;
// if unset, the endpoint is disabled. No-ops (200 with an empty summary) if
// PLAID_CLIENT_ID/PLAID_SECRET aren't configured.

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
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
  const summary = await refreshBankSync();
  return NextResponse.json({ ok: true, ...summary, at: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
