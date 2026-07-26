import { NextResponse, type NextRequest } from "next/server";
import { postDueRecurring } from "@/lib/recurring";

// Scheduled recurring-transaction posting endpoint.
// Point a scheduler at this (Vercel Cron, GitHub Actions, system cron, …):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/recurring
//
// Posts due occurrences for EVERY user. Protected by CRON_SECRET; if unset,
// the endpoint is disabled.

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
  const summary = await postDueRecurring();
  return NextResponse.json({ ok: true, ...summary, at: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
