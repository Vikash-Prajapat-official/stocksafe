import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";

// The public landing page (SPEC section 11). Static content only: it needs no database and no JavaScript to read.
// "Try the demo" goes to DEMO_URL when a demo is hosted somewhere, otherwise to this install's own sign-in page.
export async function generateMetadata() {
  const t = await getTranslations("landing");
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

const INSTALL = ["cp .env.example .env", "docker compose up -d", "docker compose exec app npx prisma db seed"];
const FEATURES = ["fefo", "alerts", "reorder", "indents", "counts", "barcode", "reports"] as const;
const AUDIENCE = ["stores", "pharmacies", "chcs", "nursingHomes", "ngos"] as const;
const STEPS = ["receive", "issue", "alert"] as const;
const EVIDENCE = [
  { key: "north", links: [{ href: "https://link.springer.com/10.1186/s40360-015-0043-8", label: "BMC Pharmacology and Toxicology, 2015" }] },
  { key: "puducherry", links: [{ href: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8654139/", label: "PMC8654139" }, { href: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8853832/", label: "PMC8853832" }] },
  { key: "gap", links: [] },
] as const;

export default async function Home() {
  const t = await getTranslations("landing");
  const demo = process.env.DEMO_URL?.trim() || "/login";
  const btn = "inline-flex h-11 items-center justify-center rounded-md px-5 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-800";
  const wrap = "mx-auto w-full max-w-5xl px-5";

  return (
    <div className="bg-white text-neutral-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        {t("skip")}
      </a>
      <header className="border-b">
        <div className={`${wrap} flex items-center justify-between py-3`}>
          <span className="text-lg font-semibold text-green-800">StockSafe</span>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Link href="/login" className="text-sm font-medium text-green-800 underline-offset-2 hover:underline">
              {t("signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-green-50">
          <div className={`${wrap} grid items-center gap-10 py-14 md:grid-cols-2 md:py-20`}>
            <div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-green-900 md:text-5xl">{t("heroTitle")}</h1>
              <p className="mt-4 text-lg text-neutral-700">{t("heroSub")}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={demo} className={`${btn} bg-green-700 text-white hover:bg-green-800`}>
                  {t("tryDemo")}
                </a>
                <a href="#install" className={`${btn} border border-green-700 bg-white text-green-800 hover:bg-green-50`}>
                  {t("installFree")}
                </a>
              </div>
            </div>

            <figure aria-label={t("heroVisualLabel")} className="rounded-xl border bg-white p-5 shadow-sm">
              <figcaption className="mb-3 flex items-center justify-between text-sm">
                <span className="font-medium text-neutral-700">{t("expiryCentre")}</span>
                <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">{t("demoData")}</span>
              </figcaption>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="text-3xl font-semibold tabular-nums text-amber-800">{t("heroAmount")}</div>
                <div className="text-sm text-amber-900">{t("heroAmountLabel")}</div>
              </div>
              <ul className="mt-3 space-y-2 text-sm tabular-nums">
                {[
                  { n: "Paracetamol 500 mg", d: 18, b: "bg-red-50 text-red-700" },
                  { n: "Amoxicillin 250 mg", d: 41, b: "bg-amber-50 text-amber-800" },
                  { n: "ORS sachet", d: 57, b: "bg-amber-50 text-amber-800" },
                ].map((r) => (
                  <li key={r.n} className="flex items-center justify-between rounded border px-3 py-2">
                    <span>{r.n}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${r.b}`}>{t("daysLeft", { days: r.d })}</span>
                  </li>
                ))}
              </ul>
            </figure>
          </div>
        </section>

        {/* The problem */}
        <section className={`${wrap} py-14`} aria-labelledby="problem">
          <h2 id="problem" className="text-2xl font-semibold">{t("problemTitle")}</h2>
          <p className="mt-2 max-w-3xl text-neutral-700">{t("problemSub")}</p>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {EVIDENCE.map((e) => (
              <li key={e.key} className="rounded-lg border p-5">
                <p className="text-neutral-800">{t(`evidence.${e.key}`)}</p>
                {e.links.length > 0 ? (
                  <p className="mt-3 text-sm text-neutral-700">
                    {t("source")}:{" "}
                    {e.links.map((l, i) => (
                      <span key={l.href}>
                        {i > 0 ? ", " : ""}
                        <a href={l.href} rel="noopener noreferrer" target="_blank" className="text-green-800 underline">
                          {l.label}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="bg-neutral-50" aria-labelledby="how">
          <div className={`${wrap} py-14`}>
            <h2 id="how" className="text-2xl font-semibold">{t("howTitle")}</h2>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s} className="rounded-lg border bg-white p-5">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-green-700 text-sm font-semibold tabular-nums text-white">{i + 1}</div>
                  <h3 className="font-semibold">{t(`steps.${s}.title`)}</h3>
                  <p className="mt-1 text-sm text-neutral-700">{t(`steps.${s}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Features */}
        <section className={`${wrap} py-14`} aria-labelledby="features">
          <h2 id="features" className="text-2xl font-semibold">{t("featuresTitle")}</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f} className="rounded-lg border p-4">
                <h3 className="font-semibold text-green-800">{t(`features.${f}.title`)}</h3>
                <p className="mt-1 text-sm text-neutral-700">{t(`features.${f}.text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Who it is for */}
        <section className="bg-green-50" aria-labelledby="who">
          <div className={`${wrap} py-12`}>
            <h2 id="who" className="text-2xl font-semibold">{t("whoTitle")}</h2>
            <ul className="mt-5 flex flex-wrap gap-3">
              {AUDIENCE.map((a) => (
                <li key={a} className="rounded-full border border-green-200 bg-white px-4 py-2 text-sm text-green-900">{t(`who.${a}`)}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Trust */}
        <section className={`${wrap} py-14`} aria-labelledby="trust">
          <h2 id="trust" className="text-2xl font-semibold">{t("trustTitle")}</h2>
          <p className="mt-2 max-w-3xl text-lg text-neutral-800">{t("trustText")}</p>
        </section>

        {/* Install */}
        <section id="install" className="bg-neutral-900 text-white" aria-labelledby="install-h">
          <div className={`${wrap} py-14`}>
            <h2 id="install-h" className="text-2xl font-semibold">{t("installTitle")}</h2>
            <p className="mt-2 max-w-3xl text-neutral-200">{t("installSub")}</p>
            <ol className="mt-5 space-y-3">
              {INSTALL.map((c, i) => (
                <li key={c} className="flex items-start gap-3">
                  <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-semibold tabular-nums">{i + 1}</span>
                  <code className="block w-full overflow-x-auto rounded bg-black px-3 py-2 text-sm text-green-100">{c}</code>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-neutral-300">{t("installNote")}</p>
          </div>
        </section>

        {/* FAQ */}
        <section className={`${wrap} py-14`} aria-labelledby="faq">
          <h2 id="faq" className="text-2xl font-semibold">{t("faqTitle")}</h2>
          <dl className="mt-5 divide-y rounded-lg border">
            {(["dvdms", "internet", "free"] as const).map((k) => (
              <div key={k} className="px-5 py-4">
                <dt className="font-semibold">{t(`faq.${k}.q`)}</dt>
                <dd className="mt-1 text-neutral-700">{t(`faq.${k}.a`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t bg-neutral-50">
        <div className={`${wrap} flex flex-wrap items-center justify-between gap-3 py-6 text-sm text-neutral-700`}>
          <span>{t("footer")}</span>
          <nav aria-label={t("footerNav")} className="flex gap-4">
            <Link href="/login" className="text-green-800 hover:underline">{t("signIn")}</Link>
            <Link href="/health" className="text-green-800 hover:underline">{t("health")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
