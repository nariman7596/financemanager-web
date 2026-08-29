"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, LOCALE_NAMES } from "@financemanager/i18n/config";
import { useLocale } from "@/lib/i18n/client";
import { setLocale } from "@/app/actions/locale";
import { cn } from "@/lib/utils";

/**
 * Language picker. Two visual modes:
 *  - "menu" (default): a labelled <select>, used in the sidebar/settings.
 *  - "inline": compact pill buttons, used on the login/register entry screens
 *    where there is no chrome yet.
 * On change it persists via `setLocale` (cookie + profile) then refreshes so the
 * server re-renders in the new language and text direction.
 */
export function LanguageSwitcher({
  variant = "menu",
  className,
}: {
  variant?: "menu" | "inline";
  className?: string;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  if (variant === "inline") {
    return (
      <div className={cn("inline-flex items-center gap-1 text-sm", className)}>
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => change(l)}
            disabled={pending}
            className={cn(
              "rounded-md px-2 py-1 font-medium transition-colors disabled:opacity-50",
              l === locale
                ? "bg-brand-600 text-white"
                : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
            )}
          >
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className={cn("btn-ghost w-full justify-start cursor-pointer", className)}>
      <Languages size={18} />
      <select
        value={locale}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        className="flex-1 bg-transparent outline-none cursor-pointer disabled:opacity-50"
        aria-label="Language"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-[var(--card)] text-[var(--text)]">
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
