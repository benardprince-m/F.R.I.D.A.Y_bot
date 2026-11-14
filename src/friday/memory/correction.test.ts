// Tests for the memory correction path (§7.4). The invariant: a correction changes the
// current value, retains the old value in an audit trail, and never revives the old value.
import { describe, expect, it } from "vitest";
import { correct, currentValue, wasCorrected, type MemoryRecord } from "./correction.js";

const base: MemoryRecord = {
  id: "m1",
  text: "Benard lives in Nairobi",
  provenance: { source: "chat-1", date: "2026-11-01T00:00:00Z", confidence: "inference" },
  history: [],
};

describe("correction", () => {
  it("replaces the current value and keeps the old one in history", () => {
    const { record, audit } = correct(
      base,
      "Benard lives in Mombasa",
      { source: "chat-9", date: "2026-11-14T00:00:00Z", confidence: "verified" },
      "2026-11-14T00:00:00Z",
    );
    expect(currentValue(record)).toBe("Benard lives in Mombasa");
    expect(record.history).toHaveLength(1);
    expect(record.history[0]?.text).toBe("Benard lives in Nairobi");
    expect(audit.supersededAt).toBe("2026-11-14T00:00:00Z");
  });

  it("never revives the old value as current truth after a correction", () => {
    const { record } = correct(
      base,
      "Benard lives in Mombasa",
      { source: "chat-9", date: "2026-11-14T00:00:00Z", confidence: "verified" },
      "2026-11-14T00:00:00Z",
    );
    expect(currentValue(record)).not.toBe("Benard lives in Nairobi");
    expect(record.history.some((h) => h.text === "Benard lives in Nairobi")).toBe(true);
  });

  it("accumulates multiple corrections in order", () => {
    const first = correct(
      base,
      "v2",
      { source: "s", date: "2026-11-14T00:00:00Z", confidence: "verified" },
      "2026-11-14T00:00:00Z",
    ).record;
    const second = correct(
      first,
      "v3",
      { source: "s", date: "2026-11-15T00:00:00Z", confidence: "verified" },
      "2026-11-15T00:00:00Z",
    ).record;
    expect(currentValue(second)).toBe("v3");
    expect(second.history.map((h) => h.text)).toEqual(["Benard lives in Nairobi", "v2"]);
  });

  it("reports whether a record was ever corrected", () => {
    expect(wasCorrected(base)).toBe(false);
    const { record } = correct(
      base,
      "v2",
      { source: "s", date: "2026-11-14T00:00:00Z", confidence: "verified" },
      "2026-11-14T00:00:00Z",
    );
    expect(wasCorrected(record)).toBe(true);
  });
});
