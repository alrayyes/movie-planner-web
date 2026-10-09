import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { OmdbCandidate } from "./client";
import { buildOmdbPicker, sortCandidates } from "./picker";

function candidate(title: string, year: string | undefined, imdbId: string): OmdbCandidate {
  return { title, year, imdbId, posterUrl: undefined };
}

// #628: default sort is newest-first; Title (A–Z) is the only other mode.
describe("sortCandidates", () => {
  test("puts a dated candidate first whichever side the yearless one starts on", () => {
    const yearlessFirst = sortCandidates(
      [candidate("None", undefined, "tt1"), candidate("Dated", "1999", "tt2")],
      "year",
    );
    const datedFirst = sortCandidates(
      [candidate("Dated", "1999", "tt2"), candidate("None", undefined, "tt1")],
      "year",
    );

    expect(yearlessFirst.map((c) => c.title)).toEqual(["Dated", "None"]);
    expect(datedFirst.map((c) => c.title)).toEqual(["Dated", "None"]);
  });

  test("keeps yearless candidates in OMDb's order, after the dated ones", () => {
    const candidates = [
      candidate("First", undefined, "tt1"),
      candidate("Second", undefined, "tt2"),
      candidate("Third", "1999", "tt3"),
      candidate("Fourth", undefined, "tt4"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.title)).toEqual(["Third", "First", "Second", "Fourth"]);
  });

  test("sorts by year descending", () => {
    const candidates = [
      candidate("Resident Evil", "2002", "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
      candidate("Resident Evil", "2012", "tt3"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt3", "tt1"]);
  });

  test("sorts by title alphabetically", () => {
    const candidates = [
      candidate("Resident Evil: Retribution", undefined, "tt1"),
      candidate("Resident Evil", undefined, "tt2"),
      candidate("Resident Evil: Apocalypse", undefined, "tt3"),
    ];

    const result = sortCandidates(candidates, "title");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt3", "tt1"]);
  });

  test("sorts a candidate with no year last, rather than throwing", () => {
    const candidates = [
      candidate("Resident Evil: Unknown Year", undefined, "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt1"]);
  });

  test("keeps candidates with no year in their original order", () => {
    const candidates = [
      candidate("First", undefined, "tt1"),
      candidate("Second", undefined, "tt2"),
      candidate("Third", undefined, "tt3"),
      candidate("Dated", "2020", "tt4"),
      candidate("Fourth", undefined, "tt5"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt4", "tt1", "tt2", "tt3", "tt5"]);
  });

  test("sorts a TV series' year range by its first year, not last", () => {
    const candidates = [
      candidate("Resident Evil (TV Series)", "2016–2019", "tt1"),
      candidate("Resident Evil", "2026", "tt2"),
      candidate("Resident Evil (Older Series)", "2010–", "tt3"),
    ];

    const result = sortCandidates(candidates, "year");

    expect(result.map((c) => c.imdbId)).toEqual(["tt2", "tt1", "tt3"]);
  });

  test("does not mutate the input array", () => {
    const candidates = [candidate("B", "2020", "tt1"), candidate("A", "2021", "tt2")];
    const original = [...candidates];

    sortCandidates(candidates, "title");

    expect(candidates).toEqual(original);
  });
});

// The picker builds its DOM by hand, so these run it against happy-dom's
// document and read back what a visitor would see and click.
describe("buildOmdbPicker", () => {
  const globals = globalThis as unknown as { document?: Document };
  let original: Document | undefined;

  beforeEach(() => {
    original = globals.document;
    globals.document = new Window().document as unknown as Document;
  });

  afterEach(() => {
    globals.document = original;
  });

  const withPoster = (
    title: string,
    year: string | undefined,
    imdbId: string,
    posterUrl?: string,
  ) => ({
    title,
    year,
    imdbId,
    posterUrl,
  });

  function titles(root: HTMLElement): string[] {
    return [...root.querySelectorAll("button[aria-label]")].map(
      (b) => b.getAttribute("aria-label") ?? "",
    );
  }

  test("introduces the choice and labels the container", () => {
    const root = buildOmdbPicker(
      [candidate("Dune", "2021", "tt1")],
      () => {},
      () => {},
    );

    expect(root.tagName).toBe("DIV");
    expect(root.getAttribute("aria-label")).toBe("Choose the matching title");
    expect(root.className).toContain("rounded-lg");
    const intro = root.querySelector("p");
    expect(intro?.textContent).toBe(
      "OMDb didn't find a single confident match. Pick the right one, or continue without metadata:",
    );
    expect(intro?.className).toContain("text-sm");
  });

  test("lists each candidate as a button labelled with its title and year", () => {
    const root = buildOmdbPicker(
      [candidate("Dune", "2021", "tt1"), candidate("Dune", undefined, "tt2")],
      () => {},
      () => {},
    );

    expect(titles(root)).toEqual(["Dune (2021)", "Dune"]);
    const first = root.querySelector("button[aria-label]") as HTMLButtonElement;
    expect(first.type).toBe("button");
    expect(first.className).toContain("w-32");
    expect(first.querySelector("span")?.textContent).toBe("Dune (2021)");
  });

  test("shows a poster only when the candidate has one", () => {
    const root = buildOmdbPicker(
      [
        withPoster("Dune", "2021", "tt1", "https://img/dune.jpg"),
        withPoster("Arrival", "2016", "tt2"),
      ],
      () => {},
      () => {},
    );

    const images = root.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe("https://img/dune.jpg");
    expect(images[0]?.getAttribute("alt")).toBe("Dune poster");
    expect(images[0]?.className).toContain("h-40");
  });

  test("hands the clicked candidate to onSelect", () => {
    const picked: OmdbCandidate[] = [];
    const dune = candidate("Dune", "2021", "tt1");
    const root = buildOmdbPicker(
      [dune, candidate("Arrival", "2016", "tt2")],
      (c) => picked.push(c),
      () => {},
    );

    (root.querySelectorAll("button[aria-label]")[0] as HTMLButtonElement).click();

    expect(picked).toEqual([dune]);
  });

  test("puts the list in a scrollable container and lists newest first", () => {
    const root = buildOmdbPicker(
      [candidate("Old", "1990", "tt1"), candidate("New", "2024", "tt2")],
      () => {},
      () => {},
    );

    expect(titles(root)).toEqual(["New (2024)", "Old (1990)"]);
    const list = root.querySelector("button[aria-label]")?.parentElement;
    expect(list?.className).toContain("max-h-96");
    expect(list?.className).toContain("overflow-y-auto");
  });

  test("offers a sort control for several candidates and re-sorts on change", () => {
    const root = buildOmdbPicker(
      [candidate("B", "2024", "tt1"), candidate("A", "1990", "tt2")],
      () => {},
      () => {},
    );

    const select = root.querySelector("select") as HTMLSelectElement;
    expect(select.id).toBe("omdb-picker-sort");
    expect(select.className).toContain("w-full");
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ["year", "Newest first"],
      ["title", "Title (A–Z)"],
    ]);
    const wrapper = select.closest("label");
    expect(wrapper?.getAttribute("for")).toBe("omdb-picker-sort");
    expect(wrapper?.className).toContain("flex-col");
    const text = wrapper?.querySelector("span");
    expect(text?.textContent).toBe("Sort by");
    expect(text?.className).toContain("font-medium");

    select.value = "title";
    select.dispatchEvent(new (globals.document as Document).defaultView!.Event("change"));
    expect(titles(root)).toEqual(["A (1990)", "B (2024)"]);

    select.value = "year";
    select.dispatchEvent(new (globals.document as Document).defaultView!.Event("change"));
    expect(titles(root)).toEqual(["B (2024)", "A (1990)"]);
  });

  test("leaves out the sort control for a single candidate", () => {
    const root = buildOmdbPicker(
      [candidate("Dune", "2021", "tt1")],
      () => {},
      () => {},
    );

    expect(root.querySelector("select")).toBeNull();
  });

  test("dismiss button defaults to continuing without metadata", () => {
    let dismissed = 0;
    const root = buildOmdbPicker(
      [candidate("Dune", "2021", "tt1")],
      () => {},
      () => {
        dismissed++;
      },
    );

    const buttons = root.querySelectorAll("button");
    const dismiss = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(dismiss.type).toBe("button");
    expect(dismiss.textContent).toBe("Continue without metadata");
    expect(dismiss.className).toContain("border-slate-300");
    dismiss.click();
    expect(dismissed).toBe(1);
  });

  test("dismiss button takes a custom label", () => {
    const root = buildOmdbPicker(
      [candidate("Dune", "2021", "tt1")],
      () => {},
      () => {},
      "Cancel",
    );

    const buttons = root.querySelectorAll("button");
    expect(buttons[buttons.length - 1]?.textContent).toBe("Cancel");
  });
});
