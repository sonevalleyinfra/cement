import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "@/lib/roles";

/** requireAdmin redirects a non-admin: `redirect()` throws, so nothing after it runs. */
const role = { current: "admin" as string | null };
const transaction = vi.fn();
const reverseDispatchInTx = vi.fn();
vi.mock("@/lib/session", () => ({
  requireAdmin: async () => {
    if (role.current !== "admin") throw new Error("NEXT_REDIRECT /dashboard");
    return { user: { id: "admin-1", role: "admin" } };
  },
}));
vi.mock("@/lib/form-submissions", () => ({
  saveOnce: async (_req: unknown, work: (tx: unknown) => Promise<{ ok: boolean; resultId?: string; error?: string }>) => {
    transaction();
    const res = await work({ fake: true });
    return res.ok ? { ...res, replay: false } : res;
  },
}));
vi.mock("@/lib/reversals", () => ({ reverseDispatchInTx: (...a: unknown[]) => reverseDispatchInTx(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { reverseDispatch } = await import("./reverse-actions");

const input = {
  dispatchId: "4f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f",
  bags: 10,
  toPlace: "godown:5f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f",
  reasonCode: "returned",
  note: "",
  requestId: "6f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f",
};

beforeEach(() => {
  role.current = "admin";
  transaction.mockReset();
  reverseDispatchInTx.mockReset();
  reverseDispatchInTx.mockResolvedValue({ ok: true, reversalId: "r1", orderId: "o1" });
});

describe("reverseDispatch (server action)", () => {
  it.each([...ROLES.filter((r) => r !== "admin"), null])("refuses %s before any transaction or write", async (r) => {
    role.current = r;
    await expect(reverseDispatch(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(transaction).not.toHaveBeenCalled();
    expect(reverseDispatchInTx).not.toHaveBeenCalled();
  });
  it("an admin's reversal runs the core in one saved form with the admin as actor", async () => {
    expect(await reverseDispatch(input)).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(reverseDispatchInTx.mock.calls[0][1]).toMatchObject({
      dispatchId: input.dispatchId,
      bags: 10,
      toPlace: { kind: "godown", id: "5f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f" },
      reasonCode: "returned",
      actor: { id: "admin-1", role: "admin" },
    });
  });
  it("refuses bad ids and a bad place without a transaction", async () => {
    expect(await reverseDispatch({ ...input, dispatchId: "x" })).toEqual({ ok: false, error: "Load not found." });
    expect(await reverseDispatch({ ...input, requestId: "x" })).toEqual({ ok: false, error: "Refresh the page and try again." });
    expect(await reverseDispatch({ ...input, toPlace: "nowhere" })).toEqual({ ok: false, error: "Pick where the bags go back." });
    expect(transaction).not.toHaveBeenCalled();
  });
  it("a missing reason is refused (the core's answer is passed on)", async () => {
    reverseDispatchInTx.mockResolvedValue({ ok: false, error: "Pick a reason" });
    expect(await reverseDispatch({ ...input, reasonCode: "" })).toEqual({ ok: false, error: "Pick a reason" });
  });
});
