import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// Public on purpose: used by Docker healthchecks. Returns no sensitive data.
export async function GET() {
  const status = await checkHealth();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
