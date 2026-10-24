import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLES } from "@/lib/roles";

/** requireAdmin redirects a non-admin: `redirect()` throws, so nothing after it runs. */
const role = { current: "admin" as string | null };
const transaction = vi.fn();
const reversePurchaseInTx = vi.fn();
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
vi.mock("@/lib/reversals", () => ({ reversePurchaseInTx: (...a: unknown[]) => reversePurchaseInTx(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { reversePurchase } = await import("./reverse-actions");

const input = {
  movementId: "4f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f",
  bags: 50,
  reasonCode: "entry_mistake",
  note: "",
  requestId: "6f0f5c1e-8a2b-4c3d-9e1f-0a1b2c3d4e5f",
};

beforeEach(() => {
  role.current = "admin";
  transaction.mockReset();
  reversePurchaseInTx.mockReset();
  reversePurchaseInTx.mockResolvedValue({ ok: true, movementId: "m1" });
});

describe("reversePurchase (server action)", () => {
  it.each([...ROLES.filter((r) => r !== "admin"), null])("refuses %s before any transaction or write", async (r) => {
    role.current = r;
    await expect(reversePurchase(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(transaction).not.toHaveBeenCalled();
    expect(reversePurchaseInTx).not.toHaveBeenCalled();
  });
  it("an admin's reversal runs the core in one saved form", async () => {
    expect(await reversePurchase(input)).toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(reversePurchaseInTx.mock.calls[0][1]).toMatchObject({ movementId: input.movementId, bags: 50, actor: { id: "admin-1", role: "admin" } });
  });
  it("refuses bad ids without a transaction, and passes on a missing reason", async () => {
    expect(await reversePurchase({ ...input, movementId: "x" })).toEqual({ ok: false, error: "Purchase not found." });
    expect(transaction).not.toHaveBeenCalled();
    reversePurchaseInTx.mockResolvedValue({ ok: false, error: "Pick a reason" });
    expect(await reversePurchase({ ...input, reasonCode: "" })).toEqual({ ok: false, error: "Pick a reason" });
  });
});
