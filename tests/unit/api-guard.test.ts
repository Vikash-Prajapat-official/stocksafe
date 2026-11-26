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
vi.spyOn(console, "error").mockImplementation(() => {}); // handlers that reach the fake db log a 500

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

  it("finds the routes", () => expect(files.length).toBeGreaterThan(25));

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

// Who may call what (SPEC section 7). Every route must appear here: the test below fails if one is missing.
type Allowed = readonly RoleName[] | "ANY";
const ADMIN: Allowed = ["ADMIN"];
const MATRIX: [string, string, Allowed][] = [
  ["items/route", "GET", "ANY"],
  ["items/route", "POST", ADMIN],
  ["items/[id]/route", "GET", "ANY"],
  ["items/[id]/route", "PATCH", ADMIN],
  ["items/[id]/ledger/route", "GET", "ANY"],
  ["items/import/route", "POST", ADMIN],
  ["items/import/template/route", "GET", ADMIN],
  ["stock/route", "GET", "ANY"],
  ["grn/route", "POST", ["STOREKEEPER"]],
  ["issue/route", "POST", ["STOREKEEPER", "PHARMACIST"]],
  ["dispense/route", "POST", ["PHARMACIST"]],
  ["writeoff/route", "POST", ADMIN],
  ["returns/route", "POST", ADMIN],
  ["indents/route", "GET", "ANY"],
  ["indents/route", "POST", ["NURSE"]],
  ["indents/[id]/route", "GET", "ANY"],
  ["indents/[id]/submit/route", "POST", ["NURSE"]],
  ["indents/[id]/approve/route", "POST", ["STOREKEEPER"]],
  ["indents/[id]/reject/route", "POST", ["STOREKEEPER"]],
  ["indents/[id]/issue/route", "POST", ["STOREKEEPER"]],
  ["indents/[id]/close/route", "POST", ["STOREKEEPER"]],
  ["alerts/expiry/route", "GET", "ANY"],
  ["alerts/low-stock/route", "GET", "ANY"],
  ["counts/route", "GET", ["STOREKEEPER", "ADMIN", "AUDITOR"]],
  ["counts/route", "POST", ["STOREKEEPER", "ADMIN"]],
  ["counts/[id]/route", "GET", ["STOREKEEPER", "ADMIN", "AUDITOR"]],
  ["counts/[id]/route", "PATCH", ["STOREKEEPER", "ADMIN"]],
  ["counts/[id]/approve/route", "POST", ADMIN],
  ["admin/stores/route", "GET", ADMIN],
  ["admin/stores/route", "POST", ADMIN],
  ["admin/stores/[id]/route", "PATCH", ADMIN],
  ["admin/suppliers/route", "GET", ADMIN],
  ["admin/suppliers/route", "POST", ADMIN],
  ["admin/suppliers/[id]/route", "PATCH", ADMIN],
  ["admin/users/route", "GET", ADMIN],
  ["admin/users/route", "POST", ADMIN],
  ["admin/users/[id]/route", "PATCH", ADMIN],
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
  it("the matrix covers every exported handler of every guarded route", () => {
    const expected = new Set<string>();
    for (const f of routeFiles(API_DIR)) {
      const rel = path.relative(API_DIR, f).split(path.sep).join("/");
      if (PUBLIC_ROUTES.has(rel)) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/export\s+const\s+(\w+)\s*=\s*route\(/g)) {
        if (METHODS.includes(m[1]!)) expected.add(`${rel.replace(/\.ts$/, "")} ${m[1]}`);
      }
    }
    expect(new Set(MATRIX.map(([m, v]) => `${m} ${v}`))).toEqual(expected);
  });

  it.each(MATRIX)("%s %s: anonymous callers get 401", async (mod, method) => {
    session.user = null;
    const res = await call(mod, method);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  const cases = MATRIX.flatMap(([mod, method, allowed]) =>
    ROLES.map((role) => [mod, method, role, allowed === "ANY" || allowed.includes(role)] as const),
  );
  it.each(cases)("%s %s as %s (allowed: %s)", async (mod, method, role, allowed) => {
    session.user = { id: "u1", name: "T", role };
    const res = await call(mod, method);
    if (allowed) {
      // Past the guard: the fake database or the empty body then makes the handler fail, but never with 401/403.
      expect([401, 403]).not.toContain(res.status);
    } else {
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    }
  });
});
