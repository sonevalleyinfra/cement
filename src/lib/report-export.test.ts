import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "./roles";

const getSession = vi.fn();
const writeAudit = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/db", () => ({ db: { fake: true } }));

const { serveCsv } = await import("./report-export");

const range = { from: "2026-04-01", to: "2026-04-30" };
const call = (build = vi.fn(async () => [["a", 1]])) =>
  serveCsv({ report: "sales", filename: "sales_2026-04-01_2026-04-30.csv", range, build, details: { retailerId: "r1" } });

beforeEach(() => {
  getSession.mockReset();
  writeAudit.mockReset();
});

describe("serveCsv", () => {
  it("answers 401 with no session, and builds nothing", async () => {
    getSession.mockResolvedValue(null);
    const build = vi.fn(async () => [["x"]]);
    const res = await call(build);
    expect(res.status).toBe(401);
    expect(build).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it.each(ROLES.filter((r) => r !== "admin"))("answers 403 for %s, builds nothing, writes no activity", async (role) => {
    getSession.mockResolvedValue({ user: { id: "u1", role } });
    const build = vi.fn(async () => [["x"]]);
    const res = await call(build);
    expect(res.status).toBe(403);
    expect(build).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("answers 403 for a user with no role", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: null } });
    expect((await call()).status).toBe(403);
  });

  it("gives an admin the file and writes one activity row", async () => {
    getSession.mockResolvedValue({ user: { id: "u1", role: "admin" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="sales_2026-04-01_2026-04-30.csv"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    // .text() drops the BOM, so look at the raw bytes.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("a,1\r\n");
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit).toHaveBeenCalledWith(
      { fake: true },
      {
        actorId: "u1",
        entity: "report",
        action: "export",
        entityId: "sales",
        details: { report: "sales", from: "2026-04-01", to: "2026-04-30", retailerId: "r1" },
      },
    );
  });
});
