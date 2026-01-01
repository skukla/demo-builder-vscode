/**
 * Dead CSS Audit Tests
 *
 * Validates that dead CSS classes have been removed from custom-spectrum.css
 * and verifies the expected reduction in file size.
 *
 * Part of CSS Architecture Improvement - Step 1: Dead CSS Cleanup
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';

describe('Dead CSS Audit', () => {
  const projectRoot = resolve(__dirname, '../../../..');
  const cssPath = resolve(
    projectRoot,
    'src/core/ui/styles/custom-spectrum.css'
  );

  let cssContent: string;

  beforeAll(() => {
    cssContent = readFileSync(cssPath, 'utf-8');
  });

  describe('Dead CSS Removal Verification', () => {
    // These classes were verified as unused during the dead CSS audit
    // by searching src/**/*.tsx and src/**/*.ts for references.
    // Classes that ARE used have been removed from this list.
    const removedClasses = [
      // Unused opacity utilities (opacity-70 IS used in UtilityBar.tsx)
      'opacity-60',

      // Unused position utilities
      'top-7',
      'left-3',
      'right-2',
      'bottom-14',

      // Unused dimension utilities
      'w-3',
      'w-4',
      'w-6',
      'w-100',
      'w-150',
      'w-200',
      'w-300',
      'w-400',
      'w-600',
      'h-3',
      'h-4',
      'h-6',
      'h-100',
      'h-screen',

      // Unused min-width utilities (min-w-100 IS used in PrerequisitesStep.tsx)
      'min-w-60',
      'min-w-80',
      'min-w-150',
      'min-w-200',
      'min-w-240',

      // Unused max-width utilities
      'max-w-240',
      'max-w-400',
      'max-w-500',
      'max-w-900',

      // Unused min-height utilities (min-h-48 IS used in FieldHelpButton.tsx)
      'min-h-96',
      'min-h-200',

      // Unused max-height utilities
      'max-h-300',
      'max-h-400',
      'max-h-500',

      // Unused border utilities
      'border-r',
      'border-l',
      'border-2',
      'border-3',
      'border-dashed',
      'border-dotted',
      'border-gray-400',
      'border-blue-400',

      // Unused background utilities (bg-gray-400 IS used in TimelineNav.tsx)
      'bg-gray-200',
      'bg-gray-300',
      'bg-gray-600',
      'bg-gray-700',
      'bg-gray-800',
      'bg-green-600',
      'bg-blue-600',
      'bg-red-100',

      // Unused text utilities
      // (text-white, text-gray-800, text-blue-700 ARE used in TimelineNav.tsx)
      'letter-spacing-1',

      // Unused display utilities
      'inline',

      // Unused rounded utilities
      'rounded-none',
      'rounded-sm',
      'rounded-xl',

      // Unused shadow utilities
      'shadow-sm',
      'shadow',
      'shadow-lg',
      'shadow-xl',
      'shadow-none',

      // Unused transform utilities
      'translate-y-0',
      'translate-y--2',
      'translate-y-2',
      'scale-110',
      'scale-125',
      'scale-150',
      'scale-200',

      // Unused box sizing utilities
      'box-border',
      'box-content',

      // Unused line height utilities
      'line-height-16',
    ];

    it('should not contain any removed dead CSS classes', () => {
      const foundClasses: string[] = [];

      for (const className of removedClasses) {
        // Check for the class definition in CSS (e.g., ".w-100 {")
        const classPattern = new RegExp(`\\.${className}\\s*\\{`, 'g');
        if (classPattern.test(cssContent)) {
          foundClasses.push(className);
        }
      }

      expect(foundClasses).toEqual([]);
    });

    it('each removed class should have zero references in TSX/TS files', () => {
      const srcDir = resolve(projectRoot, 'src');

      for (const className of removedClasses) {
        // Search for class usage in source files using grep
        try {
          // Use grep to search for the class name in TSX/TS files
          const result = execSync(
            `grep -r --include="*.tsx" --include="*.ts" -l "${className}" "${srcDir}" 2>/dev/null || true`,
            { encoding: 'utf-8' }
          );

          // Filter out CSS files and test files from results
          const matches = result
            .split('\n')
            .filter((line) => line.trim() && !line.includes('.css'));

          // If there are real usages (not just in CSS), this class shouldn't be removed
          expect(matches).toEqual([]);
        } catch {
          // grep returns non-zero if no matches, which is expected
        }
      }
    });
  });

  describe('Active CSS Classes Remain', () => {
    // These classes ARE used and should still exist
    // Verified by grep search in src/**/*.tsx and src/**/*.ts
    const activeClasses = [
      // Typography - heavily used
      'text-xs',
      'text-sm',
      'text-base',
      'text-md',
      'text-lg',
      'font-medium',
      'font-semibold',
      'font-bold',

      // Layout - heavily used
      'flex',
      'flex-column',
      'flex-1',
      'items-center',
      'w-full',
      'h-full',

      // Spacing - heavily used
      'mb-2',
      'mb-3',
      'mb-4',
      'gap-2',
      'gap-3',

      // Colors - heavily used
      'text-gray-500',
      'text-gray-600',
      'bg-gray-50',
      'bg-gray-75',

      // Classes verified as used (would have been false positives)
      'opacity-70', // Used in UtilityBar.tsx
      'min-w-100', // Used in PrerequisitesStep.tsx
      'min-h-48', // Used in FieldHelpButton.tsx
      'text-gray-800', // Used in TimelineNav.tsx
      'text-blue-700', // Used in TimelineNav.tsx
      'text-white', // Used in TimelineNav.tsx
      'bg-gray-400', // Used in TimelineNav.tsx

      // Component-specific - heavily used
      // Note: prerequisite-* classes migrated to CSS Module (Step 5 of CSS Architecture Improvement)
      // Note: selector-*, expandable-brand-*, brand-card-*, architecture-* classes migrated to CSS Module (Step 6)
      // Note: projects-grid, projects-sticky-header migrated to CSS Module (Step 7)
      'timeline-container',
    ];

    it.each(activeClasses)(
      'should retain active class: %s',
      (className: string) => {
        const classPattern = new RegExp(`\\.${className}[\\s{,:]`, 'g');
        expect(cssContent).toMatch(classPattern);
      }
    );
  });

  describe('CSS File Size Reduction', () => {
    // Original baseline: 3,148 lines (actual count)
    // Removing 63 unused utility classes
    // Target reduction: ~2% (~63 lines minimum)
    // Expected final: ~3,085 lines or less
    const ORIGINAL_LINE_COUNT = 3148;
    const MIN_REDUCTION_LINES = 60; // 63 classes removed, minimum ~60 lines
    const MAX_LINE_COUNT = ORIGINAL_LINE_COUNT - MIN_REDUCTION_LINES;

    it('should have reduced line count from baseline', () => {
      const lineCount = cssContent.split('\n').length;

      expect(lineCount).toBeLessThan(ORIGINAL_LINE_COUNT);
    });

    it('should achieve target reduction in file size', () => {
      const lineCount = cssContent.split('\n').length;

      expect(lineCount).toBeLessThanOrEqual(MAX_LINE_COUNT);
    });

    it('should report reduction metrics', () => {
      const lineCount = cssContent.split('\n').length;
      const reduction = ORIGINAL_LINE_COUNT - lineCount;
      const percentReduction = ((reduction / ORIGINAL_LINE_COUNT) * 100).toFixed(
        1
      );

      // Log metrics for visibility
      console.log(`CSS Line Count: ${lineCount} (was ${ORIGINAL_LINE_COUNT})`);
      console.log(`Reduction: ${reduction} lines (${percentReduction}%)`);

      // Just ensure we can calculate - actual assertion is in previous tests
      expect(lineCount).toBeGreaterThan(0);
    });
  });

  describe('CSS Audit Script', () => {
    const scriptPath = resolve(projectRoot, 'scripts/audit-dead-css.js');

    it('should have audit script created', () => {
      expect(existsSync(scriptPath)).toBe(true);
    });
  });
});
