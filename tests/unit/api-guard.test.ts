import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ROLES, type RoleName } from "@/lib/rbac";

// A database that fails loudly: a guarded route must never reach it for a rejected caller.
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("database touched before the role check passed"); } }),
}));
const session = vi.hoisted(() => ({ user: null as null | { id: string; name: string; role: string } }));
vi.mock("@/lib/session", () => ({ getSessionUser: async () => session.user }));

const API_DIR = path.join(__dirname, "../../src/app/api");
const PUBLIC_ROUTES = new Set(["health/route.ts", "auth/[...nextauth]/route.ts"]);
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : [];
  });
}

describe("every API route is wrapped in route(...)", () => {
  const files = routeFiles(API_DIR).map((f) => ({ f, rel: path.relative(API_DIR, f).split(path.sep).join("/") }));

  it("finds the routes", () => expect(files.length).toBeGreaterThan(8));

  it.each(files.filter(({ rel }) => !PUBLIC_ROUTES.has(rel)))("$rel", ({ f }) => {
    const src = readFileSync(f, "utf8");
    const exported = [...src.matchAll(/export\s+(?:const|async function|function)\s+(\w+)/g)]
      .map((m) => m[1] as string)
      .filter((n) => METHODS.includes(n));
    expect(exported.length).toBeGreaterThan(0);
    for (const m of exported) {
      expect(src, `${m} must be declared as: export const ${m} = route(...)`).toMatch(
        new RegExp(`export\\s+const\\s+${m}\\s*=\\s*route\\(`),
      );
    }
  });
});

const ADMIN_ROUTES: [string, string][] = [
  ["items/route", "POST"],
  ["items/[id]/route", "PATCH"],
  ["items/import/route", "POST"],
  ["items/import/template/route", "GET"],
  ["admin/stores/route", "GET"],
  ["admin/stores/route", "POST"],
  ["admin/stores/[id]/route", "PATCH"],
  ["admin/suppliers/route", "GET"],
  ["admin/suppliers/route", "POST"],
  ["admin/suppliers/[id]/route", "PATCH"],
  ["admin/users/route", "GET"],
  ["admin/users/route", "POST"],
  ["admin/users/[id]/route", "PATCH"],
];
const SIGNED_IN_ROUTES: [string, string][] = [
  ["items/route", "GET"],
  ["items/[id]/route", "GET"],
];

async function call(mod: string, method: string) {
  const handlers = (await import(/* @vite-ignore */ `@/app/api/${mod}`)) as Record<
    string,
    (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
  >;
  const fn = handlers[method];
  if (!fn) throw new Error(`${mod} has no ${method}`);
  return fn(new Request("http://localhost/api/x", { method }), { params: Promise.resolve({ id: "x" }) });
}

describe("role checks on the server", () => {
  it.each([...ADMIN_ROUTES, ...SIGNED_IN_ROUTES])("%s %s rejects anonymous callers with 401", async (mod, method) => {
    session.user = null;
    const res = await call(mod, method);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  const nonAdmins = ROLES.filter((r): r is Exclude<RoleName, "ADMIN"> => r !== "ADMIN");
  it.each(ADMIN_ROUTES.flatMap(([mod, method]) => nonAdmins.map((role) => [mod, method, role] as const)))(
    "%s %s rejects %s with 403",
    async (mod, method, role) => {
      session.user = { id: "u1", name: "T", role };
      const res = await call(mod, method);
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    },
  );
});
