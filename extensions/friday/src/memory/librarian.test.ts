// FRIDAY core tests: Librarian classify (B-02).
import { describe, expect, it } from "vitest";
import { classify, type ExistingMemory } from "./librarian.js";

const now = "2026-11-13T12:00:00Z";
const provenance = { source: "conv-1", date: now, confidence: "verified" as const };

describe("classify", () => {
  it("ADDs a novel memory", () => {
    const d = classify(
      { text: "Benard is preparing for KNEC exams.", provenance, importance: 0.8 },
      [],
      now,
    );
    expect(d.op).toBe("ADD");
  });

  it("refuses to store an uncertain candidate without confirmation", () => {
    const uncertain = { source: "conv-2", date: now, confidence: "uncertain" as const };
    const d = classify(
      { text: "Benard might prefer tea.", provenance: uncertain, importance: 0.9 },
      [],
      now,
    );
    expect(d.op).toBe("NOOP");
    expect(d.reason).toContain("uncertain");
  });

  it("stores an uncertain candidate when the owner confirms", () => {
    const uncertain = { source: "conv-2", date: now, confidence: "uncertain" as const };
    const d = classify(
      { text: "Benard prefers tea.", provenance: uncertain, importance: 0.9 },
      [],
      now,
      { confirmed: true },
    );
    expect(d.op).toBe("ADD");
  });

  it("NOOPs a near-duplicate that is not stronger", () => {
    const existing: ExistingMemory[] = [
      {
        id: "m1",
        text: "Benard is preparing for the KNEC exams.",
        provenance,
        useCount: 5,
        lastUsed: now,
      },
    ];
    const d = classify(
      { text: "Benard is preparing for the KNEC exams.", provenance, importance: 0.5 },
      existing,
      now,
    );
    expect(d.op).toBe("NOOP");
    expect(d.targetId).toBe("m1");
  });

  it("UPDATEs when a near-duplicate candidate is stronger than a stale record", () => {
    const existing: ExistingMemory[] = [
      {
        id: "m1",
        text: "Benard is preparing for the KNEC exams.",
        provenance,
        useCount: 0,
        lastUsed: "2025-01-01T00:00:00Z",
      },
    ];
    const d = classify(
      { text: "Benard is preparing for the KNEC exams.", provenance, importance: 0.95 },
      existing,
      now,
    );
    expect(d.op).toBe("UPDATE");
    expect(d.targetId).toBe("m1");
  });

  it("MERGEs related but distinct facts", () => {
    const existing: ExistingMemory[] = [
      {
        id: "m1",
        text: "Benard studies at a boarding school in Kenya.",
        provenance,
        useCount: 2,
        lastUsed: now,
      },
    ];
    const d = classify(
      {
        text: "Benard studies at a boarding school and sits KNEC exams.",
        provenance,
        importance: 0.7,
      },
      existing,
      now,
    );
    expect(d.op).toBe("MERGE");
    expect(d.targetId).toBe("m1");
  });
});
