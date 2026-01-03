/**
 * Utility Classes Tests
 *
 * Validates that active utility classes have correct CSS property definitions.
 * Classes are now in modular files under utilities/ and components/.
 *
 * Part of CSS Architecture Improvement - Step 1: Dead CSS Cleanup
 * Updated after React Aria migration (spectrum/ directory removed)
 */
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Utility Classes', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');

  // Helper to read and combine modular CSS files
  const readModularCSS = () => {
    const files = [
      'utilities/typography.css',
      'utilities/colors.css',
      'utilities/layout.css',
      'utilities/spacing.css',
      'utilities/borders.css',
      'utilities/buttons.css',
      'components/common.css',
    ];
    return files.map(f => readFileSync(join(stylesDir, f), 'utf-8')).join('\n');
  };

  let cssContent: string;

  beforeAll(() => {
    cssContent = readModularCSS();
  });

  describe('Typography Utilities', () => {
    it('defines text-xs with 11px font-size', () => {
      expect(cssContent).toMatch(/\.text-xs\s*\{[^}]*font-size:\s*11px/);
    });

    it('defines text-sm with 12px font-size', () => {
      expect(cssContent).toMatch(/\.text-sm\s*\{[^}]*font-size:\s*12px/);
    });

    it('defines text-base with 13px font-size', () => {
      expect(cssContent).toMatch(/\.text-base\s*\{[^}]*font-size:\s*13px/);
    });

    it('defines text-lg with 16px font-size', () => {
      expect(cssContent).toMatch(/\.text-lg\s*\{[^}]*font-size:\s*16px/);
    });

    it('defines font-semibold with 600 weight', () => {
      expect(cssContent).toMatch(/\.font-semibold\s*\{[^}]*font-weight:\s*600/);
    });

    it('defines font-bold with 700 weight', () => {
      expect(cssContent).toMatch(/\.font-bold\s*\{[^}]*font-weight:\s*700/);
    });
  });

  describe('Layout Utilities', () => {
    it('defines flex with display: flex', () => {
      expect(cssContent).toMatch(/\.flex\s*\{[^}]*display:\s*flex/);
    });

    it('defines flex-column with flex-direction: column', () => {
      expect(cssContent).toMatch(
        /\.flex-column\s*\{[^}]*flex-direction:\s*column/
      );
    });

    it('defines items-center with align-items: center', () => {
      expect(cssContent).toMatch(
        /\.items-center\s*\{[^}]*align-items:\s*center/
      );
    });

    it('defines w-full with width: 100%', () => {
      expect(cssContent).toMatch(/\.w-full\s*\{[^}]*width:\s*100%/);
    });

    it('defines h-full with height: 100%', () => {
      expect(cssContent).toMatch(/\.h-full\s*\{[^}]*height:\s*100%/);
    });
  });

  describe('Spacing Utilities', () => {
    it('defines mb-2 with 8px margin-bottom', () => {
      expect(cssContent).toMatch(/\.mb-2\s*\{[^}]*margin-bottom:\s*8px/);
    });

    it('defines mb-3 with 12px margin-bottom', () => {
      expect(cssContent).toMatch(/\.mb-3\s*\{[^}]*margin-bottom:\s*12px/);
    });

    it('defines gap-2 with 8px gap', () => {
      expect(cssContent).toMatch(/\.gap-2\s*\{[^}]*gap:\s*8px/);
    });

    it('defines gap-3 with 12px gap', () => {
      expect(cssContent).toMatch(/\.gap-3\s*\{[^}]*gap:\s*12px/);
    });

    it('defines p-3 with 12px padding', () => {
      expect(cssContent).toMatch(/\.p-3\s*\{[^}]*padding:\s*12px/);
    });
  });

  describe('Color Utilities', () => {
    it('defines text-gray-500 using Spectrum variable', () => {
      expect(cssContent).toMatch(
        /\.text-gray-500\s*\{[^}]*color:\s*var\(--spectrum-global-color-gray-500\)/
      );
    });

    it('defines text-gray-600 using Spectrum variable', () => {
      expect(cssContent).toMatch(
        /\.text-gray-600\s*\{[^}]*color:\s*var\(--spectrum-global-color-gray-600\)/
      );
    });

    it('defines bg-gray-50 using Spectrum variable', () => {
      expect(cssContent).toMatch(
        /\.bg-gray-50\s*\{[^}]*background-color:\s*var\(--spectrum-global-color-gray-50\)/
      );
    });

    it('defines bg-gray-75 using Spectrum variable', () => {
      expect(cssContent).toMatch(
        /\.bg-gray-75\s*\{[^}]*background-color:\s*var\(--spectrum-global-color-gray-75\)/
      );
    });
  });

  describe('Position Utilities', () => {
    it('defines relative with position: relative', () => {
      expect(cssContent).toMatch(/\.relative\s*\{[^}]*position:\s*relative/);
    });

    it('defines absolute with position: absolute', () => {
      expect(cssContent).toMatch(/\.absolute\s*\{[^}]*position:\s*absolute/);
    });

    it('defines top-0 with top: 0', () => {
      expect(cssContent).toMatch(/\.top-0\s*\{[^}]*top:\s*0/);
    });

    it('defines z-10 with z-index: 10', () => {
      expect(cssContent).toMatch(/\.z-10\s*\{[^}]*z-index:\s*10/);
    });
  });

  describe('Display Utilities', () => {
    it('defines block with display: block', () => {
      expect(cssContent).toMatch(/\.block\s*\{[^}]*display:\s*block/);
    });

    it('defines hidden with display: none', () => {
      expect(cssContent).toMatch(/\.hidden\s*\{[^}]*display:\s*none/);
    });

    it('defines inline-flex with display: inline-flex', () => {
      expect(cssContent).toMatch(
        /\.inline-flex\s*\{[^}]*display:\s*inline-flex/
      );
    });

    it('defines grid with display: grid', () => {
      expect(cssContent).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    });
  });

  describe('Border Utilities', () => {
    it('defines border with 1px solid border', () => {
      expect(cssContent).toMatch(/\.border\s*\{[^}]*border:\s*1px solid/);
    });

    it('defines rounded-md with 6px border-radius', () => {
      expect(cssContent).toMatch(/\.rounded-md\s*\{[^}]*border-radius:\s*6px/);
    });

    it('defines rounded-lg with 8px border-radius', () => {
      expect(cssContent).toMatch(/\.rounded-lg\s*\{[^}]*border-radius:\s*8px/);
    });

    it('defines rounded-full with 50% border-radius', () => {
      expect(cssContent).toMatch(/\.rounded-full\s*\{[^}]*border-radius:\s*50%/);
    });
  });

  describe('Cursor Utilities', () => {
    it('defines cursor-pointer', () => {
      expect(cssContent).toMatch(/\.cursor-pointer\s*\{[^}]*cursor:\s*pointer/);
    });

    it('defines cursor-not-allowed', () => {
      expect(cssContent).toMatch(
        /\.cursor-not-allowed\s*\{[^}]*cursor:\s*not-allowed/
      );
    });
  });

  describe('Overflow Utilities', () => {
    it('defines overflow-hidden', () => {
      expect(cssContent).toMatch(
        /\.overflow-hidden\s*\{[^}]*overflow:\s*hidden/
      );
    });

    it('defines overflow-auto', () => {
      expect(cssContent).toMatch(/\.overflow-auto\s*\{[^}]*overflow:\s*auto/);
    });

    it('defines overflow-y-auto', () => {
      expect(cssContent).toMatch(
        /\.overflow-y-auto\s*\{[^}]*overflow-y:\s*auto/
      );
    });
  });

  describe('Transition Utilities', () => {
    it('defines transition-all with 0.3s duration', () => {
      expect(cssContent).toMatch(
        /\.transition-all\s*\{[^}]*transition:\s*all\s+0\.3s/
      );
    });

    it('defines transition-opacity', () => {
      expect(cssContent).toMatch(
        /\.transition-opacity\s*\{[^}]*transition:\s*opacity/
      );
    });
  });

  describe('Animation Utilities', () => {
    it('defines animate-pulse class', () => {
      // animate-pulse is in layout.css under utilities
      expect(cssContent).toMatch(/\.animate-pulse\s*\{[^}]*animation:/);
    });

    it('defines animate-fade-in class', () => {
      // animate-fade-in is in layout.css under utilities
      expect(cssContent).toMatch(/\.animate-fade-in\s*\{[^}]*animation:/);
    });
  });
});
