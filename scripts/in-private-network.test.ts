import { describe, expect, test } from "bun:test";
import { join } from "node:path";

// #640: the e2e suite flaked on `net::ERR_NETWORK_CHANGED` whenever the host's
// network interfaces changed, which they do every time Docker starts or stops
// a container. Chromium aborts its in-flight requests on each change. Run in a
// namespace that only has loopback, it never sees one. These tests check the
// wrapper that puts a command there; the 120-page probe in the ticket is what
// showed the flake gone (116 of 120 pages failed on the host, 0 inside).
const script = join(import.meta.dir, "in-private-network.sh");

const run = (command: string[], env: Record<string, string> = {}) => {
  const result = Bun.spawnSync([script, ...command], {
    env: { ...process.env, CI: "", E2E_HOST_NETWORK: "", ...env },
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString().trim(),
    err: result.stderr.toString().trim(),
  };
};

// Linux with unprivileged user namespaces; elsewhere the wrapper just runs the command.
const hasNamespaces = Bun.spawnSync(["unshare", "-Urn", "true"]).exitCode === 0;

// The interfaces the process can see. `ip` reads the live namespace, where
// /sys/class/net would show the host's whatever the process is in.
const interfaces = ["sh", "-c", "ip -br link | cut -d' ' -f1 | cut -d@ -f1 | sort | tr '\\n' ' '"];
const hostInterfaces = Bun.spawnSync(interfaces).stdout.toString().trim();

describe("in-private-network.sh", () => {
  test.skipIf(!hasNamespaces)("the command sees loopback and nothing else", () => {
    expect(run(interfaces).out).toBe("lo");
  });

  test.skipIf(!hasNamespaces)("loopback is up, so localhost works", () => {
    expect(run(["sh", "-c", "ip -br addr show lo"]).out).toMatch(/127\.0\.0\.1/);
  });

  test("the command's exit code comes back", () => {
    expect(run(["sh", "-c", "exit 3"]).code).toBe(3);
  });

  test("arguments reach the command unchanged", () => {
    expect(run(["printf", "%s|", "a b", "--retries=2"]).out).toBe("a b|--retries=2|");
  });

  test("CI runs on the host network, where nothing churns Docker", () => {
    expect(run(interfaces, { CI: "true" }).out).toBe(hostInterfaces);
  });

  test("E2E_HOST_NETWORK=1 opts out", () => {
    expect(run(interfaces, { E2E_HOST_NETWORK: "1" }).out).toBe(hostInterfaces);
  });
});
