#!/usr/bin/env node

/**
 * @file scripts/update-homebrew-formula.mjs
 * @description Regenerates the Homebrew formula from one packed tarball so release automation can keep the version and SHA aligned with the npm artifact.
 * @functions
 *   → main
 *   → buildFormulaSource
 *   → parseVersionFromTarball
 * @exports none
 * @see ../Formula/aisnitch.rb
 * @see ../.github/workflows/release.yml
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

/**
 * 📖 The release workflow already produces the exact tarball that npm publish
 * uploads. Computing the SHA from that file keeps the Homebrew formula tied to
 * the real artifact instead of duplicating release metadata by hand.
 */
async function main() {
  const tarballPath = process.argv[2];
  const formulaPath = process.argv[3];

  if (!tarballPath || !formulaPath) {
    throw new Error(
      'Usage: node scripts/update-homebrew-formula.mjs <tarball.tgz> <formula.rb>',
    );
  }

  const packageJsonPath = new URL('../package.json', import.meta.url);
  const packageInfo = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const resolvedTarballPath = resolve(tarballPath);
  const resolvedFormulaPath = resolve(formulaPath);
  const tarballBuffer = await readFile(resolvedTarballPath);
  const sha256 = createHash('sha256').update(tarballBuffer).digest('hex');
  const version =
    parseVersionFromTarball(basename(resolvedTarballPath), packageInfo.name) ??
    packageInfo.version;
  const formulaSource = buildFormulaSource({
    homepage: packageInfo.homepage,
    packageName: packageInfo.name,
    sha256,
    version,
  });

  await writeFile(resolvedFormulaPath, formulaSource, 'utf8');
  process.stdout.write(
    `Updated ${resolvedFormulaPath} for ${packageInfo.name}@${version} (${sha256}).\n`,
  );
}

function parseVersionFromTarball(tarballName, packageName) {
  const escapedPackageName = packageName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const match = tarballName.match(
    new RegExp(`^${escapedPackageName}-(.+)\\.tgz$`, 'u'),
  );

  return match?.[1];
}

function buildFormulaSource({
  homepage,
  packageName,
  sha256,
  version,
}) {
  return `class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage ${JSON.stringify(homepage)}
  url ${JSON.stringify(`https://registry.npmjs.org/${packageName}/-/${packageName}-${version}.tgz`)}
  sha256 ${JSON.stringify(sha256)}
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/aisnitch"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/aisnitch --version")
  end
end
`;
}

await main();
