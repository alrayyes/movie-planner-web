import { describe, expect, test } from "bun:test";
import { movieHref, resolveBackHref } from "./movie-link";

describe("movieHref", () => {
  test("builds a plain uid link with no from or edit", () => {
    expect(movieHref("dune-uid")).toBe("/movie?uid=dune-uid");
  });

  test("encodes a uid containing reserved characters", () => {
    expect(movieHref("a/b c")).toBe("/movie?uid=a%2Fb%20c");
  });

  test("appends edit=1 when requested", () => {
    expect(movieHref("dune-uid", { edit: true })).toBe("/movie?uid=dune-uid&edit=1");
  });

  test("appends an encoded from param when given", () => {
    expect(movieHref("dune-uid", { from: "/missing-data" })).toBe(
      "/movie?uid=dune-uid&from=%2Fmissing-data",
    );
  });

  test("preserves a from value's own query string", () => {
    expect(movieHref("dune-uid", { from: "/actor?actor=Denis+Villeneuve" })).toBe(
      "/movie?uid=dune-uid&from=%2Factor%3Factor%3DDenis%2BVilleneuve",
    );
  });

  test("combines edit and from, edit first, matching the existing ?edit=1 convention", () => {
    expect(movieHref("dune-uid", { edit: true, from: "/" })).toBe(
      "/movie?uid=dune-uid&edit=1&from=%2F",
    );
  });
});

describe("resolveBackHref", () => {
  test("returns a same-origin relative path as-is", () => {
    expect(resolveBackHref("/missing-data")).toBe("/missing-data");
  });

  test("keeps a relative path's own query string", () => {
    expect(resolveBackHref("/actor?actor=Denis+Villeneuve")).toBe("/actor?actor=Denis+Villeneuve");
  });

  test("falls back to / when there is no from value", () => {
    expect(resolveBackHref(null)).toBe("/");
  });

  test("falls back to / for an empty string", () => {
    expect(resolveBackHref("")).toBe("/");
  });

  test("falls back to / for a protocol-relative URL, refusing to reflect an external host", () => {
    expect(resolveBackHref("//evil.example.com")).toBe("/");
  });

  test("falls back to / for an absolute URL", () => {
    expect(resolveBackHref("https://evil.example.com")).toBe("/");
  });

  test("falls back to / for a value that isn't even path-shaped", () => {
    expect(resolveBackHref("missing-data")).toBe("/");
  });
});
