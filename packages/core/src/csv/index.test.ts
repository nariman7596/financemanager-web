import { describe, it, expect } from "vitest";
import { serializeCsv, toCsv, parseCsv, parseCsvObjects } from "./index";

describe("serializeCsv", () => {
  it("leaves plain fields unquoted", () => {
    expect(serializeCsv([["a", "b"]])).toBe("a,b");
  });

  it("quotes only fields that need it", () => {
    expect(serializeCsv([["plain", "has,comma", 'has"quote', "has\nnewline"]]))
      .toBe('plain,"has,comma","has""quote","has\nnewline"');
  });

  it("renders null and undefined as empty, not as the words", () => {
    // A transaction with no description must not export the string "null".
    expect(serializeCsv([[null, undefined, ""]])).toBe(",,");
  });

  it("uses CRLF between rows", () => {
    expect(toCsv(["h"], [["v"]])).toBe("h\r\nv");
  });
});

describe("parseCsv", () => {
  it("parses quoted fields containing commas, quotes and newlines", () => {
    const rows = parseCsv('a,"b,1","c""d","e\nf"');
    expect(rows).toEqual([["a", "b,1", 'c"d', "e\nf"]]);
  });

  it("strips a UTF-8 BOM (Excel writes one)", () => {
    expect(parseCsv("﻿a,b")).toEqual([["a", "b"]]);
  });

  it("accepts CRLF and LF line endings alike", () => {
    expect(parseCsv("a,b\r\nc,d")).toEqual(parseCsv("a,b\nc,d"));
  });
});

describe("round trip", () => {
  // The exporter and the importer have to agree, or a user's own export fails
  // to re-import — which is the one CSV path guaranteed to be exercised.
  it("survives the values most likely to break it", () => {
    const rows = [
      ["date", "description", "amount"],
      ["2026-08-12", 'Coffee, "large", with a\nnewline', "4.50"],
      ["2026-08-13", "", "0"],
      ["2026-08-14", "پرداخت قبض", "1234"],
    ];
    expect(parseCsv(serializeCsv(rows))).toEqual(rows);
  });
});

describe("parseCsvObjects", () => {
  it("keys rows by header", () => {
    expect(parseCsvObjects("a,b\r\n1,2")).toEqual([{ a: "1", b: "2" }]);
  });
});
