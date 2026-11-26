"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { LOCALES, LOCALE_NAMES } from "@/i18n/locale";

/** English | हिन्दी toggle. Each name is written in its own language so it can always be found. */
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <div role="group" aria-label={t("language")} className={`inline-flex overflow-hidden rounded-md border text-sm ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          disabled={pending}
          onClick={() => start(() => setLocale(l))}
          className={`px-2.5 py-1 ${l === current ? "bg-primary text-primary-foreground" : "bg-white text-neutral-700 hover:bg-neutral-100"}`}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
