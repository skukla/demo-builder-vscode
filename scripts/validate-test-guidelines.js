#!/usr/bin/env node
/**
 * Test Guidelines Validation Script
 *
 * Verifies test splitting playbook contains required sections:
 * - When to Split (decision criteria)
 * - How to Split (step-by-step process)
 * - .testUtils.ts Pattern (shared utilities documentation)
 * - Examples from successful splits
 *
 * Usage: node scripts/validate-test-guidelines.js
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const PLAYBOOK_PATH = path.join(__dirname, '../docs/testing/test-file-splitting-playbook.md');
const README_PATH = path.join(__dirname, '../tests/README.md');

function validatePlaybookExists() {
  console.log('🔍 Validating playbook exists...\n');

  if (!fs.existsSync(PLAYBOOK_PATH)) {
    console.error(`❌ Playbook not found at: ${PLAYBOOK_PATH}`);
    return false;
  }

  console.log('✅ Playbook exists');
  return true;
}

function validatePlaybookSections() {
  console.log('\n🔍 Validating playbook sections...\n');

  const content = fs.readFileSync(PLAYBOOK_PATH, 'utf8');
  const requiredSections = [
    { name: 'When to Split', pattern: /##\s+When to Split/i },
    { name: 'How to Split', pattern: /##\s+How to Split/i },
    { name: '.testUtils.ts Pattern', pattern: /##\s+\.testUtils\.ts Pattern/i },
    { name: 'Examples', pattern: /##\s+(Examples|Successful Splits)/i },
    { name: 'Decision Criteria', pattern: /(file size|line count|500 lines)/i }
  ];

  let allPresent = true;
  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      console.error(`❌ Missing required section: ${section.name}`);
      allPresent = false;
    } else {
      console.log(`✅ Found section: ${section.name}`);
    }
  }

  // Check for minimum content (not just headers)
  const wordCount = content.split(/\s+/).length;
  if (wordCount < 500) {
    console.warn(`⚠️  Playbook seems incomplete (${wordCount} words, expected >500)`);
    allPresent = false;
  } else {
    console.log(`✅ Playbook has substantial content (${wordCount} words)`);
  }

  return allPresent;
}

async function validateExistingTestUtils() {
  console.log('\n🔍 Validating existing .testUtils.ts files...\n');

  const testUtilsFiles = await glob('tests/**/*.testUtils.ts', { absolute: true });

  if (testUtilsFiles.length === 0) {
    console.warn('⚠️  No .testUtils.ts files found (expected at least 3)');
    return true; // Not a failure, just informational
  }

  console.log(`✅ Found ${testUtilsFiles.length} .testUtils.ts files`);

  // Verify pattern consistency
  for (const file of testUtilsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // Covers every export form a testUtils file actually uses. The original
    // pattern was `export\s+(const|function|interface|type)` and reported
    // inExtensionMcpServer.testUtils.ts as having none — it has six and eight
    // importers. It misses `export class`, `export ASYNC function`, and the
    // re-export `export { X } from '...'`, which is how a testUtils file hands
    // the SUT to its specs. Nothing caught it because nothing ran this script.
    const hasExports =
        /export\s+(async\s+)?(const|function|class|interface|type|enum|default)\b/.test(content) ||
        /export\s*\{/.test(content);
    const hasMocks = /jest\.mock/.test(content) || /Mock/.test(content);

    if (!hasExports) {
      console.error(`❌ ${path.basename(file)}: No exports found`);
      return false;
    }

    console.log(`✅ ${path.basename(file)}: Follows export pattern`);
  }

  return true;
}

function validateREADMEUpdate() {
  console.log('\n🔍 Validating tests/README.md update...\n');

  const content = fs.readFileSync(README_PATH, 'utf8');

  // Check for link to playbook
  if (!content.includes('splitting-playbook.md') && !content.includes('Test File Size')) {
    console.error('❌ tests/README.md missing reference to splitting playbook');
    return false;
  }

  console.log('✅ tests/README.md references splitting guidelines');
  return true;
}

// Main execution
if (require.main === module) {
  (async () => {
    const playbookExists = validatePlaybookExists();
    const sectionsValid = playbookExists && validatePlaybookSections();
    const testUtilsValid = await validateExistingTestUtils();
    const readmeValid = validateREADMEUpdate();

    if (playbookExists && sectionsValid && testUtilsValid && readmeValid) {
      console.log('\n✅ All guideline validations passed\n');
      process.exit(0);
    } else {
      console.error('\n❌ Guideline validation failed\n');
      process.exit(1);
    }
  })();
}

module.exports = { validatePlaybookExists, validatePlaybookSections, validateExistingTestUtils };
