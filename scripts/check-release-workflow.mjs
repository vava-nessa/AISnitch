#!/usr/bin/env node
/**
 * @file check-release-workflow.mjs
 * @description Validates that the GitHub release workflow keeps the minimum permissions required for provenance-enabled npm publishes.
 * @functions
 *   → main: Reads the release workflow and exits non-zero when critical permissions disappear.
 *   → assertPermission: Verifies one permission line is present in the workflow body.
 * @exports None. This script is executed by CI as a release preflight guard.
 * @see /Users/vava/Documents/GitHub/AutoSnitch/.github/workflows/release.yml
 */

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const RELEASE_WORKFLOW_PATH = new URL('../.github/workflows/release.yml', import.meta.url);

/**
 * 📖 Release tags are expensive to debug after the fact, so CI checks the workflow text
 * before we ever cut a tag. This keeps provenance publishing from silently regressing.
 */
async function main() {
  const workflow = await readFile(RELEASE_WORKFLOW_PATH, 'utf8');

  assertPermission(workflow, 'contents: write');
  assertPermission(workflow, 'id-token: write');

  process.stdout.write('Release workflow permissions look valid.\n');
}

/**
 * 📖 Keep the validation intentionally strict and obvious: if the exact permission line
 * disappears, the build should fail loudly and force a human to look at the release flow.
 */
function assertPermission(workflow, permissionLine) {
  if (!workflow.includes(permissionLine)) {
    throw new Error(
      `Missing required release workflow permission "${permissionLine}" in .github/workflows/release.yml`,
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
