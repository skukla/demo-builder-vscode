#!/usr/bin/env node
/**
 * Dead CSS Audit Script
 *
 * Scans custom-spectrum.css for class definitions and checks if they're used
 * in the codebase (src/**\/*.tsx and src/**\/*.ts files).
 *
 * Usage:
 *   node scripts/audit-dead-css.js [--verbose] [--remove]
 *
 * Options:
 *   --verbose  Show detailed output for each class
 *   --remove   Output a list of classes safe to remove
 *
 * Part of CSS Architecture Improvement - Step 1
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CSS_FILE = path.join(
  __dirname,
  '../src/core/ui/styles/custom-spectrum.css'
);
const SRC_DIR = path.join(__dirname, '../src');

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const showRemove = args.includes('--remove');

/**
 * Extract all CSS class names from a CSS file
 * @param {string} cssContent - CSS file content
 * @returns {string[]} - Array of class names
 */
function extractClassNames(cssContent) {
  const classPattern = /\.([a-zA-Z][a-zA-Z0-9_-]*)\s*[{:,]/g;
  const classes = new Set();

  let match;
  while ((match = classPattern.exec(cssContent)) !== null) {
    const className = match[1];
    // Skip pseudo-classes and internal patterns
    if (
      !className.includes(':') &&
      !className.startsWith('spectrum-') &&
      !className.includes('__')
    ) {
      classes.add(className);
    }
  }

  return Array.from(classes).sort();
}

/**
 * Check if a class is used in the codebase
 * @param {string} className - CSS class name
 * @param {string} srcDir - Source directory to search
 * @returns {boolean} - True if the class is used
 */
function isClassUsed(className, srcDir) {
  try {
    // Search for the class name in TSX/TS files
    // We use multiple patterns to catch different usage styles
    const patterns = [
      `"${className}"`, // Direct string
      `'${className}'`, // Single quotes
      `\`${className}\``, // Template literals
      `className="${className}`, // className attribute
      `className='${className}`, // className attribute
      `UNSAFE_className="${className}`, // React Spectrum pattern
      `UNSAFE_className='${className}`, // React Spectrum pattern
      `cn('${className}'`, // classnames helper
      `cn("${className}"`, // classnames helper
    ];

    for (const pattern of patterns) {
      const result = execSync(
        `grep -r --include="*.tsx" --include="*.ts" -l "${pattern}" "${srcDir}" 2>/dev/null || true`,
        { encoding: 'utf-8' }
      );
      if (result.trim()) {
        return true;
      }
    }

    // Also check for the class name as part of a larger string
    // (e.g., 'flex items-center gap-2')
    const result = execSync(
      `grep -r --include="*.tsx" --include="*.ts" "${className}" "${srcDir}" 2>/dev/null || true`,
      { encoding: 'utf-8' }
    );

    // Filter results to only include actual class usage
    const lines = result.split('\n').filter((line) => {
      // Exclude CSS files
      if (line.includes('.css')) return false;
      // Check if it looks like a className usage
      return (
        line.includes(className) &&
        (line.includes('className') ||
          line.includes('UNSAFE_className') ||
          line.includes('cn('))
      );
    });

    return lines.length > 0;
  } catch {
    return false;
  }
}

/**
 * Main audit function
 */
function audit() {
  console.log('Dead CSS Audit');
  console.log('==============\n');

  // Read CSS file
  const cssContent = fs.readFileSync(CSS_FILE, 'utf-8');
  const lineCount = cssContent.split('\n').length;
  console.log(`CSS File: ${CSS_FILE}`);
  console.log(`Line Count: ${lineCount}\n`);

  // Extract class names
  const classNames = extractClassNames(cssContent);
  console.log(`Total Classes Found: ${classNames.length}\n`);

  // Check each class
  const usedClasses = [];
  const unusedClasses = [];

  console.log('Checking class usage...\n');

  for (const className of classNames) {
    const used = isClassUsed(className, SRC_DIR);
    if (used) {
      usedClasses.push(className);
      if (verbose) {
        console.log(`  [USED] ${className}`);
      }
    } else {
      unusedClasses.push(className);
      if (verbose) {
        console.log(`  [UNUSED] ${className}`);
      }
    }
  }

  // Summary
  console.log('\nSummary');
  console.log('-------');
  console.log(`Used Classes: ${usedClasses.length}`);
  console.log(`Unused Classes: ${unusedClasses.length}`);
  console.log(
    `Dead Code: ${((unusedClasses.length / classNames.length) * 100).toFixed(1)}%`
  );

  if (showRemove && unusedClasses.length > 0) {
    console.log('\nClasses safe to remove:');
    console.log('-----------------------');
    unusedClasses.forEach((cls) => console.log(`  .${cls}`));
  }

  // Return data for programmatic use
  return {
    totalClasses: classNames.length,
    usedClasses,
    unusedClasses,
    lineCount,
  };
}

// Run audit
const result = audit();
process.exit(result.unusedClasses.length > 0 ? 0 : 0);
