import { describe, expect, test } from "bun:test";
import { InvalidCaldavUrlError } from "./errors";
import { validateCaldavConfig } from "./validate-config";

describe("validateCaldavConfig", () => {
  test("accepts a well-formed https URL", () => {
    expect(() =>
      validateCaldavConfig({
        baseUrl: "https://caldav.example.com/calendars/me/",
        username: "me",
        password: "x",
      }),
    ).not.toThrow();
  });

  test("rejects a plain http:// URL", () => {
    expect(() =>
      validateCaldavConfig({
        baseUrl: "http://caldav.example.com/calendars/me/",
        username: "me",
        password: "x",
      }),
    ).toThrow(InvalidCaldavUrlError);
  });

  test("rejects a malformed URL", () => {
    expect(() =>
      validateCaldavConfig({ baseUrl: "not a url", username: "me", password: "x" }),
    ).toThrow(InvalidCaldavUrlError);
    expect(() =>
      validateCaldavConfig({ baseUrl: "not a url", username: "me", password: "x" }),
    ).toThrow('"not a url" is not a valid URL');
  });

  test("rejects a missing username", () => {
    expect(() =>
      validateCaldavConfig({ baseUrl: "https://caldav.example.com/", username: "", password: "x" }),
    ).toThrow("a CalDAV username is required");
  });

  test("says why an http:// URL is rejected", () => {
    expect(() =>
      validateCaldavConfig({
        baseUrl: "http://caldav.example.com/",
        username: "me",
        password: "x",
      }),
    ).toThrow("the CalDAV base URL must use https://");
  });
});
