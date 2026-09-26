import { readFileSync, writeFileSync } from 'node:fs';

// Set by npm for its `version` lifecycle script, which is how this runs.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error('version-bump: npm_package_version is unset; run it through `npm version <patch|minor>`');
  process.exit(1);
}

// read minAppVersion from manifest.json and bump version to target version
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

// update versions.json with target version and minAppVersion from manifest.json
// but only if the target version is not already in versions.json
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));
if (!(targetVersion in versions)) {
  versions[targetVersion] = minAppVersion;
  writeFileSync('versions.json', JSON.stringify(versions, null, 2) + '\n');
}
