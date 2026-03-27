# Distribution

## Purpose

The repository now contains the assets needed to publish AISnitch cleanly to npm, validate packaging locally, and hand off a Homebrew-ready formula plus GitHub release automation.

## npm packaging

`package.json` now carries the release metadata expected by npm:

- repository / homepage / bugs URLs
- public publish config
- `prepublishOnly`
- strict `files` whitelist for shipping only `dist`, `README.md`, and `LICENSE`

`.npmignore` remains in the repository as a belt-and-suspenders fallback, but the actual package boundary is controlled by `files`.

## PTY dependency decision

The task brief suggested moving `@lydell/node-pty` into `optionalDependencies`. AISnitch does **not** do that yet intentionally.

Reason:

- the CLI currently imports PTY support from the main runtime module
- if npm skipped the optional dependency on one platform, the whole CLI could fail before the operator ever uses `aisnitch wrap`

That tradeoff is not worth it for the MVP. The safer release posture is to keep the dependency normal until PTY loading is lazily split behind the wrap path.

## Homebrew formula

`Formula/aisnitch.rb` is checked in for the current version, and `scripts/update-homebrew-formula.mjs` regenerates it from a packed npm tarball:

- version is parsed from the tarball file name
- SHA256 is computed from the real artifact
- the formula points at the npm registry tarball URL

This keeps the Homebrew metadata derived from the same package the release workflow publishes.

## GitHub workflows

Two workflows are now present:

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

`ci.yml` runs lint, typecheck, test, build, and coverage across Node 20 + 22.

`release.yml` runs on `v*` tags and:

1. installs dependencies
2. runs `pnpm check`
3. creates the npm tarball
4. regenerates the Homebrew formula
5. publishes to npm
6. creates a GitHub release with the tarball and formula attached

## Community scaffolding

The repository now includes:

- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- issue templates for bug / feature / adapter requests
- a PR template
- example consumers under `examples/`

Those files are the minimum viable community surface for an open-source launch without making contributors reverse-engineer project expectations from source code alone.
