import { describe, expect, it } from "vitest";
import { checkRequestId, REFRESH_AND_RETRY, replayDecision } from "./request-rules";

const ID = "3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b";

describe("checkRequestId", () => {
  it("accepts a uuid (stored in small letters)", () => {
    expect(checkRequestId(ID.toUpperCase())).toEqual({ ok: true, id: ID });
  });
  it("refuses a missing or broken id", () => {
    for (const bad of [undefined, null, "", "abc", 12, `${ID}x`]) {
      expect(checkRequestId(bad)).toEqual({ ok: false, error: REFRESH_AND_RETRY });
    }
  });
});

describe("replayDecision", () => {
  it("the same person tapping the same save again gets the first answer back, nothing new", () => {
    expect(replayDecision({ kind: "payment", actorId: "u1", resultId: "r1" }, { kind: "payment", actorId: "u1" })).toEqual({
      ok: true,
      resultId: "r1",
    });
    expect(replayDecision({ kind: "order", actorId: "u1", resultId: null }, { kind: "order", actorId: "u1" })).toEqual({
      ok: true,
      resultId: null,
    });
  });
  it("someone else's id, or an id from another form, is refused", () => {
    expect(replayDecision({ kind: "payment", actorId: "u1", resultId: "r1" }, { kind: "payment", actorId: "u2" }).ok).toBe(false);
    expect(replayDecision({ kind: "payment", actorId: "u1", resultId: "r1" }, { kind: "order", actorId: "u1" }).ok).toBe(false);
  });
});
