import { describe, expect, it } from "vitest";
import { ROLES, checkAccess, type RoleName } from "@/lib/rbac";

describe("checkAccess", () => {
  it("returns 401 when there is no role", () => {
    expect(checkAccess(undefined, ["ADMIN"])).toEqual({ ok: false, status: 401, code: "UNAUTHENTICATED" });
    expect(checkAccess(null)).toMatchObject({ ok: false, status: 401 });
  });

  it("treats an unknown role string as not signed in", () => {
    expect(checkAccess("SUPERUSER", ["ADMIN"])).toMatchObject({ ok: false, status: 401 });
  });

  it("allows any signed-in role when no list is given", () => {
    for (const r of ROLES) expect(checkAccess(r)).toEqual({ ok: true });
  });

  it("allows only listed roles, others get 403", () => {
    const allowed: RoleName[] = ["STOREKEEPER", "PHARMACIST"];
    for (const r of ROLES) {
      const res = checkAccess(r, allowed);
      if (allowed.includes(r)) expect(res).toEqual({ ok: true });
      else expect(res).toEqual({ ok: false, status: 403, code: "FORBIDDEN" });
    }
  });

  it("an empty list allows nobody", () => {
    expect(checkAccess("ADMIN", [])).toMatchObject({ ok: false, status: 403 });
  });
});
