import { describe, expect, it } from "vitest";
import { stagger } from "./motion";

describe("stagger", () => {
  it("adds 30ms per card and stops at 150ms", () => {
    expect(stagger(0)).toEqual({ animationDelay: "0ms" });
    expect(stagger(1)).toEqual({ animationDelay: "30ms" });
    expect(stagger(5)).toEqual({ animationDelay: "150ms" });
    expect(stagger(40)).toEqual({ animationDelay: "150ms" });
  });
});
