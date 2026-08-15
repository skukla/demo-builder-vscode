#!/usr/bin/env node
/**
 * Jest Configuration Validation Script
 *
 * Verifies jest.config.js still holds the settings that have a KNOWN failure mode.
 *
 * This script used to pin `maxWorkers` to an exact 50%. That is a throughput tuning
 * knob with no correctness meaning, so it moved (25% → 75% in 3c17791e) and the check
 * was never updated — leaving `npm run validate:jest-config` failing on 2026-08-13
 * against a config nobody considered wrong. It is wired into no CI job, so it failed
 * unnoticed for over a week. A validator that pins a value people are supposed to tune
 * only teaches them to ignore it.
 *
 * What it checks now is the set of things with a documented way to hurt:
 * - workerIdleMemoryLimit at 256MB — jest.config.js records that 512MB bought 1.7s and
 *   took peak RSS 4.0GB → 6.8GB, reintroducing the OOM exposure 87db88e7 closed.
 * - maxWorkers present as a percentage, and not so high it starves timing-sensitive
 *   suites. Any value in range passes; the range is the invariant, not the value.
 * - cache settings declared INSIDE `projects`, where they take effect. At the top level
 *   they are silently inert (same trap as `roots`).
 * - the heap-size flag on the package.json test script.
 *
 * Reads the real config object rather than regex-scraping the file, so a setting that
 * moves scope cannot pass by still being present as text.
 *
 * Usage: node scripts/validate-jest-config.js
 */

const fs = require('fs');
const path = require('path');

const JEST_CONFIG_PATH = path.join(__dirname, '../jest.config.js');
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');

/** Above this, timing-sensitive suites start losing to contention on small machines. */
const MAX_WORKERS_CEILING = 75;

function validateJestConfig() {
  console.log('🔍 Validating jest.config.js...\n');

  const config = require(JEST_CONFIG_PATH);
  let ok = true;

  const maxWorkersMatch = /^(\d+)%$/.exec(String(config.maxWorkers ?? ''));
  if (!maxWorkersMatch) {
    console.error(`❌ maxWorkers is ${JSON.stringify(config.maxWorkers)}, expected a "N%" string`);
    ok = false;
  } else {
    const value = parseInt(maxWorkersMatch[1], 10);
    if (value < 1 || value > MAX_WORKERS_CEILING) {
      console.error(`❌ maxWorkers is ${value}%, expected 1-${MAX_WORKERS_CEILING}%`);
      ok = false;
    } else {
      console.log(`✅ maxWorkers is ${value}% (within 1-${MAX_WORKERS_CEILING}%)`);
    }
  }

  if (config.workerIdleMemoryLimit !== '256MB') {
    console.error(
      `❌ workerIdleMemoryLimit is ${JSON.stringify(config.workerIdleMemoryLimit)}, expected "256MB".` +
        ' Raising it reintroduces the OOM exposure 87db88e7 closed — see jest.config.js.'
    );
    ok = false;
  } else {
    console.log('✅ workerIdleMemoryLimit held at 256MB');
  }

  // Top-level cache settings do not propagate into `projects`; they must be declared
  // per-project or they do nothing at all.
  if (config.cacheDirectory || config.cache !== undefined) {
    console.error(
      '❌ cache/cacheDirectory set at the TOP LEVEL, where `projects` ignores them.' +
        ' Declare them inside each project instead.'
    );
    ok = false;
  }

  const projects = Array.isArray(config.projects) ? config.projects : [];
  if (projects.length === 0) {
    console.error('❌ No `projects` found — expected the node and react projects');
    ok = false;
  }
  for (const project of projects) {
    if (!project.cacheDirectory) {
      console.error(`❌ project "${project.displayName}" declares no cacheDirectory`);
      ok = false;
    }
  }
  if (projects.length > 0 && projects.every((p) => p.cacheDirectory)) {
    console.log(`✅ All ${projects.length} projects declare their own cacheDirectory`);
  }

  const configContent = fs.readFileSync(JEST_CONFIG_PATH, 'utf8');
  if (!configContent.includes('max-old-space-size') && !configContent.includes('heap size')) {
    console.warn('⚠️  No heap size reference comment found (non-critical)');
  } else {
    console.log('✅ Heap size documentation present');
  }

  return ok;
}

function validatePackageJson() {
  console.log('\n🔍 Validating package.json test script...\n');

  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const testScript = packageJson.scripts.test;

  if (!testScript.includes('--max-old-space-size=4096')) {
    console.error('❌ Test script missing --max-old-space-size=4096 flag');
    return false;
  }

  console.log('✅ Test script correctly includes heap size flag');
  console.log(`   ${testScript}\n`);

  return true;
}

// Main execution
if (require.main === module) {
  const jestConfigValid = validateJestConfig();
  const packageJsonValid = validatePackageJson();

  if (jestConfigValid && packageJsonValid) {
    console.log('✅ All configuration validations passed\n');
    process.exit(0);
  } else {
    console.error('❌ Configuration validation failed\n');
    process.exit(1);
  }
}

module.exports = { validateJestConfig, validatePackageJson };
