import { describe, expect, test } from "bun:test";
import { openStreetMapUrl } from "./links";

// #749: the link is a plain OpenStreetMap viewer URL, centred on the point and
// zoomed in to street level. Anyone's browser opens it, so its exact shape is
// the behaviour.
describe("openStreetMapUrl", () => {
  test("marks the point and centres a street-level map on it", () => {
    expect(openStreetMapUrl({ lat: 52.3665062, lon: 4.8947073 })).toBe(
      "https://www.openstreetmap.org/?mlat=52.3665062&mlon=4.8947073#map=18/52.3665062/4.8947073",
    );
  });

  test("keeps the sign of a coordinate west of Greenwich or south of the equator", () => {
    expect(openStreetMapUrl({ lat: -33.8688, lon: -70.6693 })).toBe(
      "https://www.openstreetmap.org/?mlat=-33.8688&mlon=-70.6693#map=18/-33.8688/-70.6693",
    );
  });
});
