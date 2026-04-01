# Version bump to 0.2.11

## Description

Update the repository to version **0.2.11** after the npm token was added and CI warnings were cleared. This includes:
- Bumping `package.json` and `packages/client/package.json` to `0.2.11`.
- Updating `src/package-info.ts` `AISNITCH_VERSION`.
- Adjusting all test expectations for the new version.
- Adding a changelog entry.
- Updating CI workflow (pnpm version already aligned).

## Acceptance Criteria
- All `package.json` version fields are `0.2.11`.
- `AISNITCH_VERSION` constant is `0.2.11`.
- All tests expecting a version string pass.
- `CHANGELOG.md` contains a `0.2.11` entry.
- CI workflow runs without errors.
- `pnpm -r publish` succeeds (assuming npm token is present).