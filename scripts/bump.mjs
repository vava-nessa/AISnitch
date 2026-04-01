#!/usr/bin/env node

/**
 * @file scripts/bump.mjs
 * @description Atomic version bump script — zero risk of forgetting a file.
 *
 * Updates both package.json files, adds a CHANGELOG entry, runs build + tests,
 * then commits, tags, and pushes. The version constant in src/package-info.ts
 * is injected at build time from package.json so it never needs manual editing.
 *
 * Usage:
 *   node scripts/bump.mjs <version>
 *   pnpm bump <version>
 *
 * Example:
 *   pnpm bump 0.2.15
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+(-[\w.]+)?$/u.test(newVersion)) {
  console.error('❌  Usage: pnpm bump <version>');
  console.error('    Example: pnpm bump 0.2.15');
  process.exit(1);
}

/** Run a shell command and stream output to the terminal. */
function run(cmd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

/** Update the "version" field of a JSON file in place. */
function bumpJson(filePath) {
  const content = JSON.parse(readFileSync(filePath, 'utf-8'));
  const previous = content.version;
  content.version = newVersion;
  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
  console.log(`  ✅ ${filePath}  ${previous} → ${newVersion}`);
}

/** Prepend a new section to CHANGELOG.md after the [Unreleased] heading. */
function bumpChangelog() {
  const filePath = 'CHANGELOG.md';
  const content = readFileSync(filePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  const entry = [
    `## [${newVersion}] / [@aisnitch/client ${newVersion}] - ${today}`,
    '',
    '### Changed',
    `- Bump to ${newVersion}.`,
    '',
  ].join('\n');

  const updated = content.replace('## [Unreleased]\n', `## [Unreleased]\n\n${entry}`);

  if (updated === content) {
    console.warn('  ⚠️  Could not find "[Unreleased]" marker in CHANGELOG.md — skipping.');
    return;
  }

  writeFileSync(filePath, updated);
  console.log(`  ✅ CHANGELOG.md updated`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n🚀  Bumping to v${newVersion}\n`);

console.log('📝  Updating versions...');
bumpJson('package.json');
bumpJson('packages/client/package.json');
bumpChangelog();

console.log('\n🔨  Building...');
run('pnpm build');

console.log('\n🧪  Testing...');
run('pnpm test');

console.log('\n📦  Committing...');
run('git add package.json packages/client/package.json CHANGELOG.md');
run(`git commit -m "chore: bump to ${newVersion} (task: version bump)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`);
run(`git tag v${newVersion}`);
run('git push origin main');
run(`git push origin v${newVersion}`);

console.log(`\n🎉  v${newVersion} pushed — CI + npm publish in progress!\n`);
