import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // put <title> and the meta description in <head> (not streamed later), so every crawler and audit tool sees them
  htmlLimitedBots: /.*/,
  // @react-pdf/renderer is loaded from node_modules at run time (it reads its font files from there)
  serverExternalPackages: ["@react-pdf/renderer"],
  // on serverless hosts (Vercel) only traced files are shipped: the PDF fonts are read by path at run time, so name them
  // (the key is a pattern, so "[name]" must not appear in it: brackets would be read as a set of characters)
  outputFileTracingIncludes: {
    "/api/reports/**": ["./node_modules/@fontsource/noto-sans-devanagari/files/*.woff", "./node_modules/pdfkit/js/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // the service worker must always be fetched fresh so an update reaches every PC, and may control the whole site
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
