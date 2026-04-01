# Version bump to 0.2.10

## Description

Update the package version across the monorepo to `0.2.10`, align the `AISNITCH_VERSION` constant, adjust tests, docs, and changelog. Verify all CI checks pass.

## Acceptance Criteria
- `package.json` and `packages/client/package.json` version set to `0.2.10`.
- `src/package-info.ts` `AISNITCH_VERSION` updated to `0.2.10`.
- Tests expecting version updated accordingly.
- Changelog entry added for `0.2.10`.
- CI workflow pnpm version updated to `10.33.0`.
- All tests pass.
