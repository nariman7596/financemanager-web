"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction } from "@/app/actions/auth";
import { Wallet } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? t("auth.signingIn") : t("auth.signIn")}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useActionState(loginAction, undefined);
  const t = useT();

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-sm p-8">
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-600 text-white">
              <Wallet size={22} />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{t("app.name")}</h1>
              <p className="text-xs text-slate-500">{t("auth.welcomeBack")}</p>
            </div>
          </div>
          <LanguageSwitcher variant="inline" />
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t("auth.email")}</label>
            <input id="email" name="email" type="email" required className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label" htmlFor="password">{t("auth.password")}</label>
            <input id="password" name="password" type="password" required className="input" placeholder="••••••••" />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
          )}

          <SubmitButton />
        </form>

        <p className="text-sm text-slate-500 mt-6 text-center">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="text-brand-600 font-medium hover:underline">
            {t("auth.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
