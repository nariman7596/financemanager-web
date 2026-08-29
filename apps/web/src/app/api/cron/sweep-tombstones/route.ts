import { NextResponse, type NextRequest } from "next/server";
import { sweepTombstones } from "@financemanager/db";

// Scheduled hard-delete of tombstones every device has already seen.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/sweep-tombstones
//
// A deleted row is kept as a tombstone so other devices learn it is gone. It
// can only be removed once no sync cursor could still need it — otherwise a
// device that has been offline for a month comes back, never learns about the
// delete, and re-creates the row from its own copy. Households with no
// registered device are skipped entirely rather than swept eagerly.
//
// Protected by CRON_SECRET; if unset, the endpoint is disabled.

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
  const days = Number(req.nextUrl.searchParams.get("olderThanDays")) || 30;
  const removed = await sweepTombstones(days);
  return NextResponse.json({ ok: true, removed, olderThanDays: days, at: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
