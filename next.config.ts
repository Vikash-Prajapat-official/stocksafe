import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @react-pdf/renderer is loaded from node_modules at run time (it reads its font files from there)
  serverExternalPackages: ["@react-pdf/renderer"],
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
    ];
  },
};

export default nextConfig;
