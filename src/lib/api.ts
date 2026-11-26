import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type z } from "zod";
import { ApiError } from "@/lib/api-error";
import { clientIp } from "@/lib/audit";
import { checkAccess, type RoleName } from "@/lib/rbac";
import { StockError } from "@/lib/stock-errors";
import { getSessionUser, type SessionUser } from "@/lib/session";

export { ApiError };

/** Error body shape from SPEC section 7: { error: { code, message } }. */
export function errorResponse(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message, e.details);
  if (e instanceof StockError) return errorResponse(e.status, e.code, e.message, e.details);
  if (e instanceof ZodError) {
    const details = e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const message = details.map((d) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ");
    return errorResponse(400, "VALIDATION", message, details);
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return errorResponse(409, "DUPLICATE", "That value already exists.");
    if (e.code === "P2025") return errorResponse(404, "NOT_FOUND", "Not found.");
    if (e.code === "P2003")
      return errorResponse(409, "IN_USE", "This record is referenced by other records.");
  }
  console.error("Unhandled API error", e);
  return errorResponse(500, "INTERNAL", "Something went wrong.");
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await readJson(req));
}

/** Like parseBody, but an empty body is treated as {} (all defaults). Invalid JSON is still a 400. */
export async function parseOptionalBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  const text = await req.text();
  if (!text.trim()) return schema.parse({});
  try {
    return schema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError) throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    throw e;
  }
}

export type HandlerArgs = {
  req: Request;
  user: SessionUser;
  params: Record<string, string>;
  ip: string | null;
};

type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Wraps every API route handler. The role check happens here, on the server, before the
 * handler runs. `allowed` is a list of roles, or "ANY" for any signed-in user.
 * Anonymous callers get 401; signed-in callers with the wrong role get 403.
 */
export function route(
  allowed: readonly RoleName[] | "ANY",
  handler: (args: HandlerArgs) => Promise<Response>,
) {
  // Next.js always passes the context; its route-type check rejects an optional parameter.
  return async (req: Request, ctx: RouteContext): Promise<Response> => {
    try {
      const user = await getSessionUser();
      const access = checkAccess(user?.role, allowed === "ANY" ? undefined : allowed);
      if (!access.ok || !user) {
        const status = access.ok ? 401 : access.status;
        return errorResponse(
          status,
          status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
          status === 401 ? "Please sign in." : "You do not have permission to do this.",
        );
      }
      const params = ctx?.params ? await ctx.params : {};
      return await handler({ req, user, params, ip: clientIp(req) });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}
