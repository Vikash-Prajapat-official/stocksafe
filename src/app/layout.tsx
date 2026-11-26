import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StockSafe",
  description: "Free, open-source stock and expiry tracker for hospital stores and pharmacies.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
