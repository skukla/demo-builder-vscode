#!/usr/bin/env node
/**
 * CI/CD validation script for test file sizes
 *
 * Enforces test file size limits to prevent bloat and memory issues:
 * - WARNING: Files > 500 lines (review recommended)
 * - ERROR: Files > 750 lines (blocks CI/CD)
 *
 * Usage:
 *   node scripts/check-test-file-sizes.js [directory]
 *   npm run test:file-sizes
 *
 * Configuration:
 *   Create .testfilesizerc.json in project root to exclude files:
 *   {
 *     "exclude": ["legacy.integration.test.ts"]
 *   }
 */

const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');

const MAX_LINES = 750; // Error threshold (blocks CI/CD)
const WARN_LINES = 500; // Warning threshold (review recommended)

/**
 * Get target directory (provided or current working directory)
 */
function getTargetDir(searchDir) {
    return searchDir || process.cwd();
}

/**
 * Load exclusions from config file (if exists)
 */
function loadExclusions(searchDir) {
    const targetDir = getTargetDir(searchDir);
    const configPath = path.join(targetDir, '.testfilesizerc.json');

    if (!fs.existsSync(configPath)) {
        return [];
    }

    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.exclude || [];
    } catch (error) {
        console.warn(`Warning: Failed to parse ${configPath}:`, error.message);
        return [];
    }
}

/**
 * Count lines in file
 */
function countLines(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').length;
    } catch (error) {
        console.warn(`Warning: Failed to read ${filePath}:`, error.message);
        return 0;
    }
}

/**
 * Check if file should be excluded
 */
function isExcluded(filePath, exclusions, searchDir) {
    const targetDir = getTargetDir(searchDir);
    const basename = path.basename(filePath);
    const relativePath = path.relative(targetDir, filePath);
    return exclusions.some(
        (pattern) => basename === pattern || relativePath === pattern || relativePath.includes(pattern)
    );
}

/**
 * Report files with size warnings
 */
function reportWarnings(warnings) {
    if (warnings.length === 0) {
        return;
    }

    console.log(`\n⚠️  ${warnings.length} test file(s) with size warning (>${WARN_LINES} lines):`);
    warnings.forEach(({ file, lines }) => {
        console.log(`  - ${file}: ${lines} lines`);
    });
    console.log('\nConsider splitting these files. See docs/testing/test-file-splitting-playbook.md');
}

/**
 * Report files that violate size limits
 */
function reportViolations(violations) {
    if (violations.length === 0) {
        return false;
    }

    console.error(`\n❌ ${violations.length} test file(s) exceed ${MAX_LINES}-line limit:`);
    violations.forEach(({ file, lines }) => {
        console.error(`  - ${file}: ${lines} lines`);
    });
    console.error(`\nTest files must be split or added to exclusions. Max: ${MAX_LINES} lines.`);
    console.error('See docs/testing/test-file-splitting-playbook.md for guidance.');
    return true;
}

/**
 * Report success status
 */
function reportSuccess(totalFiles, warnings) {
    console.log(`\n✅ All test files within size limits (<${MAX_LINES} lines)`);
    console.log(`   Checked ${totalFiles} test file(s)`);
    if (warnings.length > 0) {
        console.log(`   ${warnings.length} file(s) in warning zone (${WARN_LINES}-${MAX_LINES} lines)`);
    }
}

/**
 * Main validation logic
 */
function checkTestFileSizes(searchDir) {
    const targetDir = getTargetDir(searchDir);
    const testFiles = globSync('tests/**/*.test.{ts,tsx}', {
        cwd: targetDir,
        ignore: ['**/node_modules/**', '**/dist/**'],
        absolute: true,
    });

    if (testFiles.length === 0) {
        console.log('No test files found in', targetDir);
        return 0;
    }

    const exclusions = loadExclusions(targetDir);
    const violations = [];
    const warnings = [];

    for (const file of testFiles) {
        if (isExcluded(file, exclusions, targetDir)) {
            continue;
        }

        const lineCount = countLines(file);
        const relativePath = path.relative(targetDir, file);

        if (lineCount > MAX_LINES) {
            violations.push({ file: relativePath, lines: lineCount });
        } else if (lineCount > WARN_LINES) {
            warnings.push({ file: relativePath, lines: lineCount });
        }
    }

    // Report results
    reportWarnings(warnings);

    if (reportViolations(violations)) {
        process.exit(1);
    }

    reportSuccess(testFiles.length, warnings);
    return 0;
}

// Run if called directly
if (require.main === module) {
    const searchDir = process.argv[2];
    checkTestFileSizes(searchDir);
}

module.exports = { checkTestFileSizes, countLines, loadExclusions };
