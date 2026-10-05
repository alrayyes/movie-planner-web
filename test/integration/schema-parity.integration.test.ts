// The web app's import schema against the movie-planner CLI's (#753).
//
// Two files describe the same import format: public/schemas/movie-viewings.schema.json
// here, and examples/movies.schema.json in alrayyes/movie-planner. They are kept
// by hand, each admits the other exists, and they had drifted: the time pattern,
// the release-year type and the date description all differed. A field both define
// has to be defined the same way, so a file that imports with one tool doesn't fail
// with the other. A field only one side has (the web's uid, start, end and
// booking_ref, the CLI's source, row and seat) is that side's own.
//
// Reads the CLI's schema from its main branch, so this fails the next time the web
// repo's CI runs after the CLI changes a shared field, which is the point. Needs
// the network, like the rest of this suite. If GitHub can't be reached it warns and
// passes, since an outage isn't drift.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLI_SCHEMA_URL =
  "https://raw.githubusercontent.com/alrayyes/movie-planner/main/examples/movies.schema.json";

type Property = Record<string, unknown>;
type Schema = { $defs: { row: { properties: Record<string, Property> } } };

// What a field accepts. Descriptions and examples are prose, and can differ.
const SHAPE_KEYS = ["type", "pattern", "oneOf", "anyOf", "format", "enum", "minimum", "maximum"];
const shape = (property: Property) =>
  Object.fromEntries(
    SHAPE_KEYS.filter((key) => key in property).map((key) => [key, property[key]]),
  );

describe("the web and CLI import schemas", () => {
  test("define every field they share the same way", async () => {
    const web = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../public/schemas/movie-viewings.schema.json"),
        "utf8",
      ),
    ) as Schema;

    let cli: Schema;
    try {
      const response = await fetch(CLI_SCHEMA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      cli = (await response.json()) as Schema;
    } catch (error) {
      console.warn(`schema-parity: could not read the CLI's schema (${error}); not compared`);
      return;
    }

    const webFields = web.$defs.row.properties;
    const cliFields = cli.$defs.row.properties;
    const shared = Object.keys(webFields).filter((name) => name in cliFields);
    // The test is only worth anything if there is a lot of overlap to compare.
    expect(shared.length).toBeGreaterThan(10);

    const different = shared
      .filter(
        (name) =>
          JSON.stringify(shape(webFields[name] ?? {})) !==
          JSON.stringify(shape(cliFields[name] ?? {})),
      )
      .map((name) => ({
        name,
        web: shape(webFields[name] ?? {}),
        cli: shape(cliFields[name] ?? {}),
      }));
    expect(different).toEqual([]);
  });
});
