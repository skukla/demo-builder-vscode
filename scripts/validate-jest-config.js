#!/usr/bin/env node
/**
 * Jest Configuration Validation Script
 *
 * Verifies jest.config.js contains expected optimizations:
 * - maxWorkers set to 50%
 * - Comment references heap size configuration in package.json
 *
 * Usage: node scripts/validate-jest-config.js
 */

const fs = require('fs');
const path = require('path');

const JEST_CONFIG_PATH = path.join(__dirname, '../jest.config.js');
const PACKAGE_JSON_PATH = path.join(__dirname, '../package.json');

function validateJestConfig() {
  console.log('🔍 Validating jest.config.js...\n');

  const configContent = fs.readFileSync(JEST_CONFIG_PATH, 'utf8');

  // Check maxWorkers setting
  const maxWorkersMatch = configContent.match(/maxWorkers:\s*['"](\d+)%['"]/);
  if (!maxWorkersMatch) {
    console.error('❌ maxWorkers not found or not using percentage format');
    return false;
  }

  const maxWorkersValue = parseInt(maxWorkersMatch[1], 10);
  if (maxWorkersValue !== 50) {
    console.error(`❌ maxWorkers is ${maxWorkersValue}%, expected 50%`);
    return false;
  }

  console.log('✅ maxWorkers correctly set to 50%');

  // Check for heap size comment reference
  if (!configContent.includes('max-old-space-size') && !configContent.includes('heap size')) {
    console.warn('⚠️  No heap size reference comment found (non-critical)');
  } else {
    console.log('✅ Heap size documentation present');
  }

  return true;
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
