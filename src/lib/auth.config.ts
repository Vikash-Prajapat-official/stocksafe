import type { NextAuthConfig } from "next-auth";
import { isRole } from "@/lib/rbac";

// Edge-safe part of the Auth.js config (used by the middleware). No database or bcrypt here.
export const authConfig = {
  trustHost: true, // hospitals reach the app by LAN IP, not a fixed domain
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (isRole(token.role)) session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
