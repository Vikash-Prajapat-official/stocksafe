import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Redirects signed-out visitors to /login for app pages. API routes are excluded here
// because each one checks the user's role itself (src/lib/api.ts `route`).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|health|login|$).*)"],
};
