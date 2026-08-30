import { describe, expect, it } from "vitest";
import { revisionGreater, uuidv7 } from "./ids";

describe("uuidv7", () => {
  it("looks like a v7 UUID", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("does not collide", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()));
    expect(ids.size).toBe(10_000);
  });

  // The reason for v7 over v4: ids sort in creation order, which keeps the
  // sync cursor's (revision, id) ordering stable and gives the database index
  // locality instead of scattering every insert across the B-tree.
  it("sorts in creation order", () => {
    const early = uuidv7(1_000_000_000_000);
    const later = uuidv7(1_700_000_000_000);
    expect(early < later).toBe(true);
  });

  it("encodes the timestamp in the first 48 bits", () => {
    const at = 0x0123_4567_89ab;
    expect(uuidv7(at).replace(/-/g, "").slice(0, 12)).toBe("0123456789ab");
  });
});

describe("revisionGreater", () => {
  it("compares as integers, not strings", () => {
    // "9" > "10" lexically, which would make a cursor skip rows.
    expect(revisionGreater("10", "9")).toBe(true);
    expect(revisionGreater("9", "10")).toBe(false);
  });

  it("stays exact past 2^53, where a JSON number would not", () => {
    expect(revisionGreater("9007199254740993", "9007199254740992")).toBe(true);
  });

  it("treats an empty revision as zero", () => {
    expect(revisionGreater("1", "")).toBe(true);
    expect(revisionGreater("", "0")).toBe(false);
  });
});
