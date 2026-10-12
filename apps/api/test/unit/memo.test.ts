import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateMemo, idToMemo, memoToId, normalizeMemo } from "../../src/lib/memo";

describe("memo", () => {
  it("generates PB + 8 Crockford characters", () => {
    for (let i = 0; i < 200; i++) expect(generateMemo()).toMatch(/^PB[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("P4: normalises lowercase, O for 0, I/L for 1, spaces and dashes", () => {
    expect(normalizeMemo("PB7K2M9QXA")).toBe("PB7K2M9QXA");
    expect(normalizeMemo("pb7k2m9qxa")).toBe("PB7K2M9QXA");
    expect(normalizeMemo("  PB-7K2M 9QXA ")).toBe("PB7K2M9QXA");
    expect(normalizeMemo("PBO0OOOOOO")).toBe("PB00000000");
    expect(normalizeMemo("PBIL1il1AB")).toBe("PB111111AB");
    expect(normalizeMemo("pb 0o-1i-lL-ZZ")).toBe("PB001111ZZ");
  });

  it("P15: every memo has a numeric form (40 bits) that maps back to it", () => {
    expect(memoToId("PB00000000")).toBe(0n);
    expect(memoToId("PB00000010")).toBe(32n);
    expect(memoToId("PBZZZZZZZZ")).toBe(2n ** 40n - 1n);
    expect(idToMemo("0")).toBe("PB00000000");
    expect(idToMemo("1099511627775")).toBe("PBZZZZZZZZ");
    for (const bad of ["1099511627776", "-1", "1.5", "", "abc", "99999999999999999999"]) expect(idToMemo(bad), bad).toBeNull();
    fc.assert(
      fc.property(fc.constant(null).map(generateMemo), (memo) => {
        expect(idToMemo(memoToId(memo).toString())).toBe(memo);
      }),
    );
  });

  it("rejects anything that is not a PayBridge memo", () => {
    for (const bad of ["", "PB", "PB7K2M9QX", "PB7K2M9QXAB", "XX7K2M9QXA", "PB7K2M9QXU", "hello", "PB7K2M9QX!", "1234567890"]) {
      expect(normalizeMemo(bad), bad).toBeNull();
    }
  });

  it("P4: every generated memo survives being retyped in any case with separators", () => {
    fc.assert(
      fc.property(fc.constant(null).map(generateMemo), fc.boolean(), (memo, lower) => {
        const typed = `${memo.slice(0, 2)}-${memo.slice(2, 6)} ${memo.slice(6)}`;
        expect(normalizeMemo(lower ? typed.toLowerCase() : typed)).toBe(memo);
      }),
    );
  });
});
