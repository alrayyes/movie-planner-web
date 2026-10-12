import { describe, expect, test } from "bun:test";
import { MAX_IMPORT_BYTES, SAMPLE_CSV, validateImportFile } from "./import-file";
import { parseCsvImport } from "./import-rows";

// #843: a file is turned away before it's read, with a reason the visitor can act on.
describe("validateImportFile", () => {
  test("accepts a CSV or JSON file, whatever the case of its extension", () => {
    expect(validateImportFile({ name: "movies.csv", size: 10 })).toEqual({ ok: true });
    expect(validateImportFile({ name: "BACKUP.JSON", size: 10 })).toEqual({ ok: true });
  });

  test("rejects any other kind of file and says what is accepted", () => {
    expect(validateImportFile({ name: "movies.ics", size: 10 })).toEqual({
      ok: false,
      error: "movies.ics isn't a .csv or .json file.",
    });
    expect(validateImportFile({ name: "csv", size: 10 })).toMatchObject({ ok: false });
  });

  test("accepts a file of exactly 25 MB and rejects one byte more", () => {
    expect(MAX_IMPORT_BYTES).toBe(25 * 1024 * 1024);
    expect(validateImportFile({ name: "a.csv", size: MAX_IMPORT_BYTES })).toEqual({ ok: true });
    expect(validateImportFile({ name: "a.csv", size: MAX_IMPORT_BYTES + 1 })).toEqual({
      ok: false,
      error: "a.csv is 25.0 MB; the limit is 25 MB.",
    });
  });
});

describe("SAMPLE_CSV", () => {
  test("parses with the importer, every row valid", () => {
    const rows = parseCsvImport(SAMPLE_CSV);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.row && !r.error)).toBe(true);
  });
});
