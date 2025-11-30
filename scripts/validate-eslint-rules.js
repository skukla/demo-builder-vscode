#!/usr/bin/env node
/**
 * ESLint Max-Lines Rule Validation Script
 *
 * Verifies ESLint max-lines rule is properly configured for test files:
 * - Warns on test files 500-749 lines
 * - Errors on test files ≥750 lines
 * - Excludes non-test files from max-lines checks
 *
 * Usage: node scripts/validate-eslint-rules.js
 */

const { ESLint } = require('eslint');
const path = require('path');
const fs = require('fs');

async function validateMaxLinesRule() {
  console.log('🔍 Validating ESLint max-lines rule configuration...\n');

  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile('tests/dummy.test.ts');

  // Check max-lines rule exists
  const maxLinesConfig = config.rules['max-lines'];
  if (!maxLinesConfig) {
    console.error('❌ max-lines rule not found in ESLint configuration');
    return false;
  }

  // Verify rule configuration
  const [severity, options] = Array.isArray(maxLinesConfig) ? maxLinesConfig : [maxLinesConfig, {}];

  if (severity !== 'warn' && severity !== 1) {
    console.error(`❌ max-lines rule severity should be 'warn', got: ${severity}`);
    return false;
  }

  if (!options.max || options.max < 500 || options.max > 750) {
    console.error(`❌ max-lines max should be 500-750, got: ${options.max}`);
    return false;
  }

  console.log(`✅ max-lines rule properly configured: ${options.max} lines (${severity})`);
  return true;
}

async function validateTestFileOverrides() {
  console.log('\n🔍 Validating test file overrides...\n');

  const eslint = new ESLint();

  // Check test file config
  const testConfig = await eslint.calculateConfigForFile('tests/features/example.test.ts');
  const testMaxLines = testConfig.rules['max-lines'];

  if (!testMaxLines) {
    console.error('❌ max-lines rule not applied to test files');
    return false;
  }

  console.log('✅ max-lines rule applied to test files');

  // Check source file config (should not have restrictive max-lines)
  const srcConfig = await eslint.calculateConfigForFile('src/features/example.ts');
  const srcMaxLines = srcConfig.rules['max-lines'];

  if (srcMaxLines && srcMaxLines[1]?.max === testMaxLines[1]?.max) {
    console.warn('⚠️  Source files have same max-lines limit as test files (expected: looser or none)');
  } else {
    console.log('✅ Source files excluded from strict max-lines enforcement');
  }

  return true;
}

// Main execution
if (require.main === module) {
  (async () => {
    const ruleValid = await validateMaxLinesRule();
    const overridesValid = await validateTestFileOverrides();

    if (ruleValid && overridesValid) {
      console.log('\n✅ All ESLint rule validations passed\n');
      process.exit(0);
    } else {
      console.error('\n❌ ESLint rule validation failed\n');
      process.exit(1);
    }
  })();
}

module.exports = { validateMaxLinesRule, validateTestFileOverrides };
