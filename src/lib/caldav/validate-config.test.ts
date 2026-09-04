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
  });

  test("rejects a missing username", () => {
    expect(() =>
      validateCaldavConfig({ baseUrl: "https://caldav.example.com/", username: "", password: "x" }),
    ).toThrow(InvalidCaldavUrlError);
  });
});
