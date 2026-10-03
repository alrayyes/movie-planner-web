import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// #722: the integration stack's images carry a tag as well as a digest (so a
// pin says which version it is), and each service that something waits on has a
// healthcheck with an explicit start_period.
const compose = Bun.YAML.parse(
  readFileSync(new URL("../test/integration/compose.yaml", import.meta.url), "utf8"),
) as {
  services: Record<
    string,
    {
      image: string;
      healthcheck?: { test?: unknown; start_period?: string };
      depends_on?: Record<string, { condition?: string }>;
    }
  >;
};

describe("test/integration/compose.yaml", () => {
  for (const [name, service] of Object.entries(compose.services)) {
    test(`${name} is pinned as name:tag@sha256:digest`, () => {
      expect(service.image).toMatch(/^[a-z0-9./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/);
    });

    test(`${name} has a healthcheck`, () => {
      expect(service.healthcheck?.test).toBeDefined();
    });
  }

  test("the baikal healthcheck sets a start_period", () => {
    expect(compose.services.baikal?.healthcheck?.start_period).toBeDefined();
  });

  test("caddy waits for baikal to be healthy", () => {
    expect(compose.services.caddy?.depends_on?.baikal?.condition).toBe("service_healthy");
  });
});
