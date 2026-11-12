import { describe, expect, it } from "vitest";
import { generateTrackingId, isTrackingId } from "./tracking-id";

describe("generateTrackingId", () => {
  it("formats TRK and DSP IDs with IST YYMMDD and unambiguous chars", () => {
    const fixedDate = new Date("2026-11-12T08:00:00Z"); // 13:30 IST on 2026-11-12
    const bytes = new Uint8Array([0, 1, 2, 3]);
    const trk = generateTrackingId("TRK", fixedDate, bytes);
    const dsp = generateTrackingId("DSP", fixedDate, bytes);
    expect(trk).toBe("TRK-261112-2345");
    expect(dsp).toBe("DSP-261112-2345");
    expect(isTrackingId(trk)).toBe(true);
    expect(isTrackingId(dsp)).toBe(true);
  });

  it("rejects malformed tracking IDs and never emits confusing chars (0, 1, O, I)", () => {
    for (let i = 0; i < 50; i++) {
      const id = generateTrackingId("TRK");
      expect(isTrackingId(id)).toBe(true);
      expect(id.slice(-4)).not.toMatch(/[01OI]/);
    }
    expect(isTrackingId("")).toBe(false);
    expect(isTrackingId("TRK-26111-2345")).toBe(false);
    expect(isTrackingId("TRK-261112-O123")).toBe(false);
  });
});
