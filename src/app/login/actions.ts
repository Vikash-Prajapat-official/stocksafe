"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export type LoginState = { error?: string } | undefined;

// Only allow redirects back into this site (no open redirect).
function safePath(p: FormDataEntryValue | null): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") ? p : "/items";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      phone: String(formData.get("phone") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: safePath(formData.get("callbackUrl")),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      if ((e as { code?: string }).code === "rate_limited")
        return { error: "Too many failed attempts. Please wait 15 minutes and try again." };
      if (e.type === "CredentialsSignin") return { error: "Wrong phone number or password." };
      return { error: "Could not sign in. Please try again." };
    }
    throw e; // the redirect after a successful sign-in is thrown and must pass through
  }
}
