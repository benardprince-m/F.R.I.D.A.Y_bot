import { describe, expect, it } from "vitest";
import {
  applyCandidate,
  forgetMemories,
  isStoredMemory,
  MEMORY_LAYER_NAME,
  newMemoryId,
  ownerCandidate,
  renderMemoryContext,
  renderMemoryList,
  renderRememberAck,
  selectForContext,
  type StoredMemory,
} from "./records.js";

const NOW = "2026-11-17T09:00:00Z";

function record(text: string, over: Partial<StoredMemory> = {}): StoredMemory {
  return {
    id: newMemoryId(text, NOW),
    text,
    provenance: { source: "owner chat", date: NOW, confidence: "verified" },
    importance: 0.7,
    useCount: 0,
    lastUsed: NOW,
    createdAt: NOW,
    ...over,
  };
}

describe("stored memory records", () => {
  it("validates a record read back from the store (trust boundary)", () => {
    expect(isStoredMemory(record("x"))).toBe(true);
    expect(isStoredMemory({ text: "x" })).toBe(false);
    expect(isStoredMemory(null)).toBe(false);
    expect(isStoredMemory({ ...record("x"), provenance: {} })).toBe(false);
  });

  it("derives a stable id from text and time", () => {
    expect(newMemoryId("a fact", NOW)).toBe(newMemoryId("a fact", NOW));
    expect(newMemoryId("a fact", NOW)).not.toBe(newMemoryId("another", NOW));
  });

  it("ADDs a first fact", () => {
    const { records, changed, op } = applyCandidate(
      [],
      ownerCandidate("Prince likes espresso", NOW),
      NOW,
    );
    expect(op).toBe("ADD");
    expect(records).toHaveLength(1);
    expect(changed).toEqual(records);
    expect(records[0]!.text).toBe("Prince likes espresso");
    expect(records[0]!.provenance).toEqual({
      source: "owner chat",
      date: NOW,
      confidence: "verified",
    });
  });

  it("NOOPs an uncertain candidate without confirmation", () => {
    const candidate = {
      text: "maybe Prince is in Berlin",
      provenance: { source: "inference", date: NOW, confidence: "uncertain" as const },
      importance: 0.9,
    };
    const result = applyCandidate([], candidate, NOW);
    expect(result.op).toBe("NOOP");
    expect(result.changed).toEqual([]);
    expect(applyCandidate([], candidate, NOW, true).op).toBe("ADD");
  });

  it("UPDATEs a near-duplicate when the candidate is stronger", () => {
    const existing = record("Prince likes espresso", { importance: 0.2 });
    const { records, op } = applyCandidate(
      [existing],
      {
        text: "Prince likes espresso",
        provenance: { source: "owner chat", date: NOW, confidence: "verified" },
        importance: 0.9,
      },
      NOW,
    );
    expect(op).toBe("UPDATE");
    expect(records[0]!.importance).toBe(0.9);
  });

  it("MERGES a related fact, keeping the longer text", () => {
    const existing = record("Prince likes espresso");
    const { records, op } = applyCandidate(
      [existing],
      {
        text: "Prince likes espresso every morning before work",
        provenance: { source: "owner chat", date: NOW, confidence: "verified" },
        importance: 0.6,
      },
      NOW,
    );
    expect(op).toBe("MERGE");
    expect(records).toHaveLength(1);
    expect(records[0]!.text).toBe("Prince likes espresso every morning before work");
  });

  it("purges matching memories and reports the layer (B-04)", () => {
    const records = [record("Prince likes espresso"), record("Prince lives in Lagos")];
    const { records: kept, report } = forgetMemories(records, "espresso");
    expect(kept.map((r) => r.text)).toEqual(["Prince lives in Lagos"]);
    expect(report.totalPurged).toBe(1);
    expect(report.purged[0]!.layer).toBe(MEMORY_LAYER_NAME);
    expect(report.complete).toBe(true);
  });

  it("reports nothing purged for a non-matching query", () => {
    const { records: kept, report } = forgetMemories([record("Prince likes espresso")], "zzz");
    expect(kept).toHaveLength(1);
    expect(report.totalPurged).toBe(0);
    expect(report.complete).toBe(true);
  });

  it("selects the records that best match the prompt, best first, bounded", () => {
    const records = [record("Prince likes espresso"), record("Prince lives in Lagos")];
    const picked = selectForContext(records, "what espresso does Prince like", 5);
    expect(picked[0]!.text).toBe("Prince likes espresso");
    expect(picked.length).toBeLessThanOrEqual(5);
  });

  it("bounds the number of retrieved records", () => {
    const records = [record("Prince likes espresso"), record("Prince likes espresso too")];
    expect(selectForContext(records, "Prince espresso", 1)).toHaveLength(1);
  });

  it("selects nothing when the prompt shares no meaningful words", () => {
    expect(selectForContext([record("Prince likes espresso")], "the weather")).toEqual([]);
  });

  it("renders a bounded, provenance-labelled context block", () => {
    const block = renderMemoryContext([record("Prince likes espresso")]);
    expect(block).toContain("FRIDAY memory");
    expect(block).toContain("espresso");
    expect(block).toContain("source: owner chat");
    expect(renderMemoryContext([])).toBeUndefined();
  });

  it("acknowledges a remember truthfully", () => {
    expect(renderRememberAck({ records: [], op: "ADD", reason: "" })).toBe("Stored.");
    expect(renderRememberAck({ records: [], op: "MERGE", reason: "" })).toContain("Merged");
    expect(renderRememberAck({ records: [], op: "NOOP", reason: "uncertain" })).toContain(
      "Not stored: uncertain",
    );
  });

  it("lists memories newest first and reports an empty store", () => {
    expect(renderMemoryList([])).toContain("No memories stored yet");
    const older = record("older fact", { createdAt: "2026-01-01T00:00:00Z" });
    const newer = record("newer fact", { createdAt: "2026-06-01T00:00:00Z" });
    const text = renderMemoryList([older, newer]);
    expect(text.indexOf("newer fact")).toBeLessThan(text.indexOf("older fact"));
  });
});
