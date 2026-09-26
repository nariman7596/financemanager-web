import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";
import { getBaseCurrency, getBudgetProgress } from "./queries";
import { getBills, localToday } from "./bills";
import { billStatusText } from "./billText";
import { budgetWindow } from "@financemanager/core/budgets";
import { formatMoney } from "@financemanager/core/money";
import { isStale, pickAlerts, type Alert } from "@financemanager/core/notify";
import { createT } from "@financemanager/i18n/translate";
import { isLocale, type Locale } from "@financemanager/i18n/config";

// ---------------------------------------------------------------------------
// Web Push. On an iPhone it reaches the app added to the Home Screen (iOS
// 16.4+). The VAPID key pair that signs every message is made on first use
// and kept in AppSetting, so there is nothing to configure.
// ---------------------------------------------------------------------------

const VAPID_KEY = "push.vapid";
const SUBJECT_KEY = "push.subject";

export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const row = await prisma.appSetting.findUnique({ where: { key: VAPID_KEY } });
  if (row) return JSON.parse(row.value);
  const keys = webpush.generateVAPIDKeys();
  try {
    await prisma.appSetting.create({ data: { key: VAPID_KEY, value: JSON.stringify(keys) } });
    return keys;
  } catch {
    // Made at the same moment by another request: use that one.
    const again = await prisma.appSetting.findUniqueOrThrow({ where: { key: VAPID_KEY } });
    return JSON.parse(again.value);
  }
}

/**
 * Who the messages say they are from: the app's own address, remembered from
 * the first device that subscribed (push services want a URL or mailto).
 */
export async function rememberSubject(origin: string | null) {
  if (!origin || !/^https:\/\//.test(origin)) return;
  await prisma.appSetting.upsert({ where: { key: SUBJECT_KEY }, create: { key: SUBJECT_KEY, value: origin }, update: {} });
}

async function subject(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: SUBJECT_KEY } });
  return process.env.PUSH_SUBJECT ?? row?.value ?? "mailto:notifications@financemanager.invalid";
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  /** Replaces an earlier notification with the same tag rather than stacking. */
  tag?: string;
}

/** Send to these devices; ones the push service says are gone are forgotten. */
export async function sendPush(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  message: PushMessage,
): Promise<{ sent: number; failed: number }> {
  if (subs.length === 0) return { sent: 0, failed: 0 };
  const [keys, sub] = await Promise.all([vapidKeys(), subject()]);
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
        vapidDetails: { subject: sub, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 12 * 60 * 60,
        timeout: 15_000,
      });
      sent++;
      await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSentAt: new Date() } });
    } catch (e) {
      failed++;
      const status = (e as { statusCode?: number }).statusCode;
      // 404/410: the device unsubscribed or the app was removed.
      if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.error("push failed", status ?? (e as Error).message);
    }
  }
  return { sent, failed };
}

/** The reader's local hour: Tehran for Persian, as transactions are dated. */
function localHour(locale: Locale, now = new Date()): number {
  const shifted = locale === "fa" ? new Date(now.getTime() + 3.5 * 60 * 60 * 1000) : now;
  return shifted.getUTCHours();
}

/**
 * The hourly run: for every household whose members have a device
 * subscribed, work out what is due (bills, budgets, rows waiting for review),
 * send what has not been sent — one notification per person, several alerts
 * folded into one — and remember it.
 */
export async function sendNotifications(now = new Date()): Promise<{ households: number; sent: number }> {
  const subs = await prisma.pushSubscription.findMany({
    include: { user: { select: { id: true, locale: true, memberships: { select: { householdId: true, role: true } } } } },
  });
  if (subs.length === 0) return { households: 0, sent: 0 };

  // Household → the people in it who have a device, with their devices.
  const byHousehold = new Map<string, Map<string, { locale: Locale; devices: typeof subs }>>();
  for (const s of subs) {
    for (const m of s.user.memberships) {
      if (m.role === "VIEWER") continue;
      const people = byHousehold.get(m.householdId) ?? new Map();
      const person = people.get(s.user.id) ?? { locale: isLocale(s.user.locale) ? s.user.locale : "en", devices: [] };
      person.devices.push(s);
      people.set(s.user.id, person);
      byHousehold.set(m.householdId, people);
    }
  }

  let sent = 0;
  for (const [householdId, people] of byHousehold) {
    // Dates and calendars follow the first person's language.
    const locale = [...people.values()][0].locale;
    const base = await getBaseCurrency(householdId);
    const [bills, budgets, waiting, log] = await Promise.all([
      getBills(householdId, base, locale),
      getBudgetProgress(householdId, now, locale),
      prisma.transaction.count({ where: { householdId, needsReview: true } }),
      prisma.notificationLog.findMany({ where: { householdId }, select: { key: true, sentAt: true, id: true } }),
    ]);
    const alerts = pickAlerts(
      {
        bills: bills.bills.filter((b) => b.active).map((b) => ({ id: b.id, state: b.status.state, due: b.status.due })),
        budgets: budgets.map((b) => ({ id: b.id, level: b.level, start: budgetWindow(b.period, now, locale).start })),
        waitingReview: waiting,
        hour: localHour(locale, now),
        day: localToday(locale, now).toISOString().slice(0, 10),
      },
      new Set(log.map((l) => l.key)),
    );

    const stale = log.filter((l) => isStale(l.sentAt, now)).map((l) => l.id);
    if (stale.length) await prisma.notificationLog.deleteMany({ where: { id: { in: stale } } });
    if (alerts.length === 0) continue;

    let delivered = 0;
    for (const person of people.values()) {
      const message = compose(alerts, person.locale, {
        bill: new Map(bills.bills.map((b) => [b.id, b])),
        budget: new Map(budgets.map((b) => [b.id, b])),
      });
      delivered += (await sendPush(person.devices, message)).sent;
    }
    // Remembered only once something got through, so a push outage retries next hour.
    if (delivered > 0) {
      await prisma.notificationLog.createMany({ data: alerts.map((a) => ({ householdId, key: a.key })), skipDuplicates: true });
      sent += delivered;
    }
  }
  return { households: byHousehold.size, sent };
}

type BillRow = Awaited<ReturnType<typeof getBills>>["bills"][number];
type BudgetRow = Awaited<ReturnType<typeof getBudgetProgress>>[number];

/** One alert as a line, and several folded into one notification. */
function compose(alerts: Alert[], locale: Locale, rows: { bill: Map<string, BillRow>; budget: Map<string, BudgetRow> }): PushMessage {
  const t = createT(locale);
  const line = (a: Alert): string => {
    if (a.kind === "bill") {
      const b = rows.bill.get(a.ref);
      return b ? `${b.name}: ${billStatusText(t, b.status, locale)} — ${formatMoney(b.amount, b.currency)}` : "";
    }
    if (a.kind === "budget") {
      const b = rows.budget.get(a.ref);
      if (!b) return "";
      return `${b.category}: ${a.state === "over" ? t("budgets.alertOver", { pct: b.pct }) : b.pct >= 80 ? t("budgets.alertWatch", { pct: b.pct }) : t("budgets.alertPace")}`;
    }
    return t("push.review", { count: a.ref });
  };
  const title = (a: Alert) => t(a.kind === "bill" ? "push.billTitle" : a.kind === "budget" ? "push.budgetTitle" : "push.reviewTitle");
  const lines = alerts.map(line).filter(Boolean);
  if (alerts.length === 1) return { title: title(alerts[0]), body: lines[0] ?? "", url: alerts[0].url, tag: alerts[0].kind };
  const shown = lines.slice(0, 4);
  if (lines.length > shown.length) shown.push(t("push.more", { count: lines.length - shown.length }));
  return { title: t("push.many", { count: alerts.length }), body: shown.join("\n"), url: "/dashboard", tag: "digest" };
}
