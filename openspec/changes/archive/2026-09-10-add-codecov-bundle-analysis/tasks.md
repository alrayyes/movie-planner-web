## 1. Add the integration

- [x] 1.1 `bun add @codecov/astro-plugin@2.0.1 --exact`
- [x] 1.2 Add to `astro.config.mjs`'s `integrations` array, gated on
      `process.env.CODECOV_TOKEN`, imported via the package's actual
      default export (the README's named-export example doesn't match the
      published 2.0.1 build)

## 2. Wire up the token

- [x] 2.1 `CODECOV_TOKEN` env var on `ci.yml`'s "playwright test" step, so
      the `astro build` it spawns can read it

## 3. Verify

- [x] 3.1 Confirm locally: a build with `CODECOV_TOKEN` set attempts an
      upload and doesn't crash the build even on a bad token; a build with
      no token skips the plugin entirely
- [ ] 3.2 Confirm live: a PR that changes the bundle shows a size-delta
      comment from Codecov — needs a real PR merged and a subsequent
      bundle-changing PR to check, not verifiable from this session
