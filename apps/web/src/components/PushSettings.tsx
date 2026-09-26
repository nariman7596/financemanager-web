"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { deletePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { useT } from "@/lib/i18n/client";

type State = "loading" | "unsupported" | "needs-home-screen" | "denied" | "off" | "on";

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/**
 * Turn notifications on for this device. On an iPhone that only works in the
 * app opened from the Home Screen (iOS 16.4+), so a Safari tab is told how.
 */
export function PushSettings({ publicKey, devices }: { publicKey: string; devices: number }) {
  const t = useT();
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !standalone() ? "needs-home-screen" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  function enable() {
    setMsg(null);
    start(async () => {
      try {
        // Must follow the tap directly: iOS only asks from a user gesture.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
        const res = await savePushSubscription(JSON.stringify(sub));
        if ("error" in res && res.error) setMsg({ ok: false, text: res.error });
        else {
          setState("on");
          setMsg({ ok: true, text: t("push.enabled") });
        }
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  function disable() {
    setMsg(null);
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });
  }

  function test() {
    setMsg(null);
    start(async () => {
      const res = await sendTestPush();
      setMsg("error" in res && res.error ? { ok: false, text: res.error } : { ok: true, text: t("push.testSent") });
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">{t("push.what")}</p>
      {state === "needs-home-screen" && <p className="text-sm rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("push.homeScreen")}</p>}
      {state === "unsupported" && <p className="text-sm text-slate-400">{t("push.unsupported")}</p>}
      {state === "denied" && <p className="text-sm text-red-600">{t("push.denied")}</p>}
      <div className="flex flex-wrap gap-2">
        {state === "off" && (
          <button type="button" className="btn-primary" onClick={enable} disabled={pending}>
            <Bell size={16} /> {pending ? t("common.saving") : t("push.enable")}
          </button>
        )}
        {state === "on" && (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <Bell size={16} /> {t("push.onHere")}
            </span>
            <button type="button" className="btn-ghost border border-[var(--border)]" onClick={test} disabled={pending}>
              <Send size={16} /> {t("push.test")}
            </button>
            <button type="button" className="btn-ghost border border-[var(--border)]" onClick={disable} disabled={pending}>
              <BellOff size={16} /> {t("push.disable")}
            </button>
          </>
        )}
      </div>
      {devices > 0 && <p className="text-xs text-slate-400">{t("push.devices", { count: devices })}</p>}
      {msg && (
        <p className={"text-sm rounded-lg px-3 py-2 " + (msg.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
