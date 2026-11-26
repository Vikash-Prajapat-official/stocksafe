import en from "../../../../messages/en.json";
import hi from "../../../../messages/hi.json";

// Shown by the service worker when the server cannot be reached. It is saved in the browser once, so it cannot depend on
// the language cookie: it shows English and Hindi together. It contains no stock or patient data.
export const metadata = { title: "Offline · StockSafe" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-green-800">StockSafe</h1>
      {[
        { lang: "en", m: en.offline },
        { lang: "hi", m: hi.offline },
      ].map(({ lang, m }) => (
        <section key={lang} lang={lang} className="space-y-2">
          <h2 className="text-lg font-semibold">{m.title}</h2>
          <p className="text-neutral-700">{m.text}</p>
        </section>
      ))}
      {/* a plain link, because there is no JavaScript to rely on when offline */}
      <a href="/dashboard" className="inline-flex h-11 w-fit items-center rounded-md bg-green-700 px-5 font-medium text-white">
        {en.offline.retry} / {hi.offline.retry}
      </a>
    </main>
  );
}
