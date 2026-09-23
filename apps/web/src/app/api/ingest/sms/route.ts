import { NextResponse, type NextRequest } from "next/server";
import { authenticateApiToken, ingestSmsBatch } from "@/lib/sms";

// Bank SMS forwarded by the phone (iOS Shortcuts automation, see docs/SMS.md).
//
//   curl -X POST -H "Authorization: Bearer fm_…" --data-binary @queue.txt \
//        https://your-app/api/ingest/sms
//
// The body is plain text: one message, or several separated by a line
// "~~~fm~~~" (the shortcut's offline queue). A JSON body {"text": "…"} is also
// accepted. Re-sending is safe — every message is stored once — so the phone
// can clear its queue only after it sees "ok": true.

export const dynamic = "force-dynamic";

const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  const scope = await authenticateApiToken(req.headers.get("authorization"));
  if (!scope) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  let body = raw;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const json = JSON.parse(raw) as { text?: unknown };
      body = typeof json.text === "string" ? json.text : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
  }

  const summary = await ingestSmsBatch(scope, body);
  return NextResponse.json({ ok: true, ...summary });
}
