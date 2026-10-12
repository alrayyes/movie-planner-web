import { describe, expect, test } from "bun:test";
import { detectCsvFormat, parseCsvImport } from "./import-rows";

// #844: Letterboxd's diary.csv, as its Settings > Data > Export gives it. A
// diary has no medium or time, so the visitor picks the medium for the file.
const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-03-02,Dune: Part Two,2024,https://boxd.it/abc1,4.5,,"imax, epic",2026-03-01
2026-03-05,Anora,2024,https://boxd.it/abc2,,Yes,,2026-03-04
`;

describe("detectCsvFormat", () => {
  test("recognises a Letterboxd diary by its headers", () => {
    expect(detectCsvFormat(DIARY)).toBe("letterboxd-diary");
  });
  test("treats this app's own format, and anything unknown, as native", () => {
    expect(detectCsvFormat("title,date,medium\nDune,2026-01-01,cinema\n")).toBe("native");
    expect(detectCsvFormat("")).toBe("native");
  });
  test("reads headers with stray spaces round them", () => {
    expect(detectCsvFormat(" Name, Letterboxd URI , Watched Date\n")).toBe("letterboxd-diary");
  });
  test("needs the watched date, since the diary Date is only when it was logged", () => {
    expect(detectCsvFormat("Date,Name,Year,Letterboxd URI,Rating\n")).toBe("native");
  });
});

describe("parseCsvImport on a Letterboxd diary", () => {
  test("maps each entry to a viewing on the date it was watched", () => {
    const [first, second] = parseCsvImport(DIARY, { medium: "cinema" });
    expect(first?.row).toMatchObject({
      title: "Dune: Part Two",
      date: "2026-03-01",
      medium: "cinema",
      year: "2024",
      letterboxdUrl: "https://boxd.it/abc1",
      letterboxdRating: "4.5",
      notes: "Tags: imax, epic",
    });
    expect(second?.row).toMatchObject({ title: "Anora", date: "2026-03-04", medium: "cinema" });
    expect(second?.row?.letterboxdRating).toBeUndefined();
    expect(second?.row?.notes).toBeUndefined();
  });

  test("copes with a diary that has no Tags column, and with blank tags", () => {
    const noTags = "Name,Letterboxd URI,Watched Date\nHeat,u,1995-12-15\n";
    expect(parseCsvImport(noTags, { medium: "tv" })[0]?.row?.notes).toBeUndefined();
    const blank = "Name,Letterboxd URI,Watched Date,Tags\nHeat,u,1995-12-15, \n";
    expect(parseCsvImport(blank, { medium: "tv" })[0]?.row?.notes).toBeUndefined();
  });

  test("reports a missing medium per row, as any other file does", () => {
    expect(parseCsvImport(DIARY)[0]?.error).toBe("medium is required");
  });

  test("keeps row numbers counting from the header, like the native format", () => {
    expect(parseCsvImport(DIARY, { medium: "cinema" }).map((r) => r.rowNumber)).toEqual([2, 3]);
  });

  test("a row with no watched date is an error, not a guess from the log date", () => {
    const text =
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n2026-03-02,Heat,1995,u,,,,\n";
    expect(parseCsvImport(text, { medium: "cinema" })[0]?.error).toContain("not a valid date");
  });
});
