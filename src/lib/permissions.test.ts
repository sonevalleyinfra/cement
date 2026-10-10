import { describe, expect, it } from "vitest";
import { ACTION_ROLES, can, isStaff, rolesFor, type Action } from "./permissions";

/**
 * The whole role-by-action matrix. One column per role, in this order:
 * admin, sales, accounts, logistics, retailer, (no role).
 * Change this table only together with docs/idea.md section 3.
 */
const PEOPLE = ["admin", "sales", "accounts", "logistics", "retailer", "user"] as const;
const Y = true;
const N = false;
const MATRIX: Record<Action, readonly boolean[]> = {
  //                 admin sales acct  logi  retl  none
  placeOrder:        [Y, Y, N, N, Y, N],
  fillRate:          [Y, Y, N, N, N, N],
  decideOrder:       [Y, N, Y, N, N, N],
  viewApprovals:     [Y, N, Y, N, N, N],
  dispatch:          [Y, N, N, Y, N, N],
  markDelivered:     [Y, N, N, Y, N, N],
  recordReceipt:     [Y, Y, Y, Y, N, N],
  viewReceipts:      [Y, Y, Y, Y, N, N],
  verifyPayments:    [Y, N, Y, N, N, N],
  useWallet:         [Y, Y, Y, Y, N, N],
  confirmHandover:   [Y, N, Y, N, N, N],
  reverseReceipt:    [Y, N, Y, N, N, N],
  viewLedger:        [Y, Y, Y, N, Y, N],
  setOpeningBalance: [Y, N, N, N, N, N],
  viewStock:         [Y, Y, Y, Y, N, N],
  manageStock:       [Y, N, N, N, N, N],
  transferStock:     [Y, N, N, Y, N, N],
  viewRetailers:     [Y, Y, Y, Y, N, N],
  editRetailers:     [Y, Y, N, N, N, N],
  linkRetailerLogin: [Y, N, N, N, N, N],
  assignSalesRep:    [Y, N, N, N, N, N],
  viewVehicles:      [Y, Y, Y, Y, N, N],
  editVehicles:      [Y, N, N, Y, N, N],
  manageUsers:       [Y, N, N, N, N, N],
  manageFirms:       [Y, N, N, N, N, N],
};

describe("permission matrix", () => {
  it("covers every action exactly", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(Object.keys(ACTION_ROLES).sort());
  });

  for (const action of Object.keys(MATRIX) as Action[]) {
    it(`${action}`, () => {
      const got = PEOPLE.map((p) => can(p, action));
      expect(got).toEqual(MATRIX[action]);
    });
  }

  it("a person with two roles gets both sets", () => {
    expect(can("sales,logistics", "dispatch")).toBe(true);
    expect(can("sales,logistics", "fillRate")).toBe(true);
    expect(can("sales,logistics", "decideOrder")).toBe(false);
  });

  it("nobody passes with an empty or missing role", () => {
    for (const action of Object.keys(MATRIX) as Action[]) {
      expect(can(null, action)).toBe(false);
      expect(can("", action)).toBe(false);
    }
  });

  it("rolesFor returns a copy of the allowed roles", () => {
    const roles = rolesFor("recordReceipt");
    roles.push("retailer");
    expect(can("retailer", "recordReceipt")).toBe(false);
  });
});

describe("isStaff", () => {
  it("is true for working roles and admin", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("sales")).toBe(true);
    expect(isStaff("accounts")).toBe(true);
    expect(isStaff("logistics")).toBe(true);
  });
  it("is false for retailers and people with no role", () => {
    expect(isStaff("retailer")).toBe(false);
    expect(isStaff("user")).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});
