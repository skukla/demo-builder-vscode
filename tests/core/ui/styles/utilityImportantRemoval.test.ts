/**
 * Utility !important Removal Tests
 *
 * Validates that utility CSS files have zero !important declarations.
 * With the @layer utilities cascade priority, !important is no longer needed.
 *
 * Part of CSS Architecture Improvement - Step 6: Remove !important
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Utility !important Removal', () => {
  const utilitiesPath = resolve(
    __dirname,
    '../../../../src/core/ui/styles/utilities'
  );

  // Shared list of utility CSS files
  const utilityFiles = [
    'animations.css',
    'borders.css',
    'colors.css',
    'layout.css',
    'spacing.css',
    'typography.css',
  ];

  // Helper to count !important declarations (excluding comments)
  const countImportantDeclarations = (content: string): number => {
    // Remove CSS comments first
    const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Count " !important" occurrences (space before to avoid false positives)
    const matches = withoutComments.match(/ !important/g);
    return matches ? matches.length : 0;
  };

  // Helper to get lines containing !important (for debugging)
  const getLinesWithImportant = (content: string): string[] => {
    const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
    return withoutComments
      .split('\n')
      .filter((line) => line.includes(' !important'))
      .map((line) => line.trim());
  };

  describe('All utility files should have zero !important declarations', () => {
    it.each(utilityFiles)('%s has no !important declarations', (file) => {
      const content = readFileSync(resolve(utilitiesPath, file), 'utf-8');
      const count = countImportantDeclarations(content);

      // Provide detailed output on failure
      if (count > 0) {
        const lines = getLinesWithImportant(content);
        console.log(`Found ${count} !important in ${file}:`);
        lines.slice(0, 5).forEach((line) => console.log(`  - ${line}`));
        if (lines.length > 5) {
          console.log(`  ... and ${lines.length - 5} more`);
        }
      }

      expect(count).toBe(0);
    });
  });

  describe('Aggregate validation', () => {
    it('should have zero total !important across all utility files', () => {
      let totalCount = 0;
      const fileCounts: Record<string, number> = {};

      utilityFiles.forEach((file) => {
        const content = readFileSync(resolve(utilitiesPath, file), 'utf-8');
        const count = countImportantDeclarations(content);
        fileCounts[file] = count;
        totalCount += count;
      });

      // Provide breakdown on failure
      if (totalCount > 0) {
        console.log('!important counts by file:');
        Object.entries(fileCounts)
          .filter(([, count]) => count > 0)
          .forEach(([file, count]) => console.log(`  ${file}: ${count}`));
        console.log(`  Total: ${totalCount}`);
      }

      expect(totalCount).toBe(0);
    });
  });

  describe('Layer structure preserved', () => {
    it('all utility files remain wrapped in @layer utilities', () => {
      utilityFiles.forEach((file) => {
        const content = readFileSync(resolve(utilitiesPath, file), 'utf-8');
        // Remove comments and check for @layer utilities wrapper
        const withoutComments = content
          .replace(/\/\*[\s\S]*?\*\/\s*/g, '')
          .trim();
        expect(withoutComments).toMatch(/^@layer\s+utilities\s*\{[\s\S]*\}$/);
      });
    });
  });
});
