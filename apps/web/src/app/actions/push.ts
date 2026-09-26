"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rememberSubject, sendPush } from "@/lib/push";
import { getT } from "@/lib/i18n/server";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

/** Remember this device's subscription (from PushManager.subscribe) for the signed-in user. */
export async function savePushSubscription(json: string) {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };
  let sub: Sub;
  try {
    sub = JSON.parse(json);
  } catch {
    return { error: "Invalid subscription" };
  }
  const endpoint = sub.endpoint ?? "";
  const p256dh = sub.keys?.p256dh ?? "";
  const auth = sub.keys?.auth ?? "";
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth || endpoint.length > 1000) return { error: "Invalid subscription" };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  await rememberSubject(host ? `https://${host.split(",")[0].trim()}` : null);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: session.userId, userAgent: h.get("user-agent")?.slice(0, 300) ?? null },
    update: { p256dh, auth, userId: session.userId },
  });
  revalidatePath("/settings");
  return { ok: true };
}

/** Stop notifications to this device. */
export async function deletePushSubscription(endpoint: string) {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.userId } });
  revalidatePath("/settings");
  return { ok: true };
}

/** A notification to every device of the signed-in user, to see it arrive. */
export async function sendTestPush() {
  const session = await getSession();
  if (!session) return { error: "Not signed in" };
  const t = await getT();
  const subs = await prisma.pushSubscription.findMany({ where: { userId: session.userId } });
  if (subs.length === 0) return { error: t("push.noDevices") };
  const r = await sendPush(subs, { title: t("push.testTitle"), body: t("push.testBody"), url: "/settings#notifications", tag: "test" });
  return r.sent > 0 ? { ok: true, sent: r.sent } : { error: t("push.testFailed") };
}
