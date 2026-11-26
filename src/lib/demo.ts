import { ApiError } from "@/lib/api-error";

/**
 * Public demo mode (DEMO_MODE=1), for the hosted demo anyone can open. Sample stock can be played with freely, but
 * nobody can change who may sign in: no new users, no edited users, no changed passwords. Real installs never set it.
 */
export const isDemoMode = () => process.env.DEMO_MODE === "1";

export function assertNotDemo(): void {
  if (isDemoMode()) throw new ApiError(403, "DEMO_MODE", "Users and passwords cannot be changed in the public demo.");
}
