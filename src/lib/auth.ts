import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { db } from "@/lib/db";
import { writeAudit, clientIp } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { dummyHash, verifyPassword } from "@/lib/password";
import { createLimiter } from "@/lib/rate-limit";

const WINDOW = 15 * 60_000;
const byPhone = createLimiter({ max: 5, windowMs: WINDOW });
const byIp = createLimiter({ max: 30, windowMs: WINDOW });

export class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  phone: z.string().max(40),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { phone: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const phone = normalizePhone(parsed.data.phone);
        const ip = (request ? clientIp(request) : null) ?? "unknown";
        const phoneKey = `phone:${phone ?? parsed.data.phone.slice(0, 20)}`;
        const ipKey = `ip:${ip}`;
        if (byPhone.isBlocked(phoneKey) || byIp.isBlocked(ipKey)) throw new RateLimitedError();

        const user = phone ? await db.user.findUnique({ where: { phone } }) : null;
        // Always run bcrypt so response time does not reveal whether the phone exists.
        const passwordOk = await verifyPassword(
          parsed.data.password,
          user?.passwordHash ?? dummyHash(),
        );

        if (!user || !user.active || !passwordOk) {
          byPhone.recordFailure(phoneKey);
          byIp.recordFailure(ipKey);
          await writeAudit(db, {
            actorUserId: user?.id ?? null,
            action: "LOGIN_FAILED",
            entity: "user",
            entityId: user?.id ?? "unknown",
            ip,
          });
          return null;
        }

        byPhone.reset(phoneKey);
        await writeAudit(db, {
          actorUserId: user.id,
          action: "LOGIN",
          entity: "user",
          entityId: user.id,
          ip,
        });
        return { id: user.id, name: user.name, role: user.role };
      },
    }),
  ],
});
