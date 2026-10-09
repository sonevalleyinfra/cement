import { describe, expect, it } from "vitest";
import { planDelivery } from "./recipients";

describe("planDelivery (EMAIL_MODE rules)", () => {
  it("log mode never sends", () => {
    expect(planDelivery("log", "a@x.com", ["a@x.com"])).toEqual({ action: "log", recipients: ["a@x.com"] });
  });

  it("live mode sends to everyone", () => {
    expect(planDelivery("live", ["a@x.com", "b@y.com"], [])).toEqual({
      action: "send",
      recipients: ["a@x.com", "b@y.com"],
      blocked: [],
    });
  });

  it("allowlist mode sends only to allowed addresses (case-insensitive)", () => {
    expect(planDelivery("allowlist", ["Tester@X.com", "stranger@y.com"], ["tester@x.com"])).toEqual({
      action: "send",
      recipients: ["tester@x.com"],
      blocked: ["stranger@y.com"],
    });
  });

  it("allowlist mode skips the email when nobody is allowed", () => {
    expect(planDelivery("allowlist", "stranger@y.com", ["tester@x.com"])).toEqual({
      action: "skip",
      blocked: ["stranger@y.com"],
    });
  });
});
