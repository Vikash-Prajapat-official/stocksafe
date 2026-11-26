import { ImageResponse } from "next/og";

// The app icon, drawn in code so no image files are needed: a green tile with a white shield and a check mark.
// /icons/icon-192.png, /icons/icon-512.png, /icons/apple-icon.png, /icons/maskable-512.png
const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "apple-icon.png": { size: 180, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const spec = SIZES[(await ctx.params).file];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, maskable } = spec;
  // a maskable icon keeps its artwork inside the central 80% so any round or square mask leaves it whole
  const art = Math.round(size * (maskable ? 0.5 : 0.62));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#15803d", borderRadius: maskable ? 0 : Math.round(size * 0.22) }}>
        <svg width={art} height={art} viewBox="0 0 24 24" fill="none">
          <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="#ffffff" />
          <path d="m8.5 12.2 2.4 2.4 4.6-4.9" stroke="#15803d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
