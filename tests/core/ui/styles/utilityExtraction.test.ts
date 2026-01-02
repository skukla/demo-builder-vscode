/**
 * Utility Extraction Tests
 *
 * Validates that utility classes have been extracted from custom-spectrum.css
 * into categorized files under utilities/.
 *
 * Part of CSS Utility Modularization - Step 2: Extract Utility Classes
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Utility Extraction', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');
  const utilitiesDir = join(stylesDir, 'utilities');

  describe('Typography Utilities', () => {
    const typographyPath = join(utilitiesDir, 'typography.css');
    let typographyContent: string;

    beforeAll(() => {
      if (existsSync(typographyPath)) {
        typographyContent = readFileSync(typographyPath, 'utf-8');
      }
    });

    it('should contain font size utilities', () => {
      expect(typographyContent).toMatch(/\.text-xs\s*\{[^}]*font-size:\s*11px/);
      expect(typographyContent).toMatch(/\.text-sm\s*\{[^}]*font-size:\s*12px/);
      expect(typographyContent).toMatch(/\.text-base\s*\{[^}]*font-size:\s*13px/);
      expect(typographyContent).toMatch(/\.text-md\s*\{[^}]*font-size:\s*14px/);
      expect(typographyContent).toMatch(/\.text-lg\s*\{[^}]*font-size:\s*16px/);
      expect(typographyContent).toMatch(/\.text-xl\s*\{[^}]*font-size:\s*18px/);
    });

    it('should contain font weight utilities', () => {
      expect(typographyContent).toMatch(/\.font-normal\s*\{[^}]*font-weight:\s*400/);
      expect(typographyContent).toMatch(/\.font-medium\s*\{[^}]*font-weight:\s*500/);
      expect(typographyContent).toMatch(/\.font-semibold\s*\{[^}]*font-weight:\s*600/);
      expect(typographyContent).toMatch(/\.font-bold\s*\{[^}]*font-weight:\s*700/);
    });

    it('should contain text alignment utilities', () => {
      expect(typographyContent).toMatch(/\.text-center\s*\{[^}]*text-align:\s*center/);
      expect(typographyContent).toMatch(/\.text-left\s*\{[^}]*text-align:\s*left/);
      expect(typographyContent).toMatch(/\.text-right\s*\{[^}]*text-align:\s*right/);
    });

    it('should contain text transform utilities', () => {
      expect(typographyContent).toMatch(/\.text-uppercase\s*\{[^}]*text-transform:\s*uppercase/);
      expect(typographyContent).toMatch(/\.text-italic\s*\{[^}]*font-style:\s*italic/);
    });
  });

  describe('Color Utilities', () => {
    const colorsPath = join(utilitiesDir, 'colors.css');
    let colorsContent: string;

    beforeAll(() => {
      if (existsSync(colorsPath)) {
        colorsContent = readFileSync(colorsPath, 'utf-8');
      }
    });

    it('should contain text color utilities using Spectrum variables', () => {
      expect(colorsContent).toMatch(
        /\.text-gray-500\s*\{[^}]*color:\s*var\(--spectrum-global-color-gray-500\)/
      );
      expect(colorsContent).toMatch(
        /\.text-gray-600\s*\{[^}]*color:\s*var\(--spectrum-global-color-gray-600\)/
      );
      expect(colorsContent).toMatch(
        /\.text-gray-700\s*\{[^}]*color:\s*var\(--spectrum-global-color-gray-700\)/
      );
    });

    it('should contain semantic text colors', () => {
      expect(colorsContent).toMatch(
        /\.text-red-600\s*\{[^}]*color:\s*var\(--spectrum-global-color-red-600\)/
      );
      expect(colorsContent).toMatch(
        /\.text-green-600\s*\{[^}]*color:\s*var\(--spectrum-global-color-green-600\)/
      );
      expect(colorsContent).toMatch(
        /\.text-blue-600\s*\{[^}]*color:\s*var\(--spectrum-global-color-blue-600\)/
      );
    });

    it('should contain background color utilities', () => {
      expect(colorsContent).toMatch(
        /\.bg-gray-50\s*\{[^}]*background-color:\s*var\(--spectrum-global-color-gray-50\)/
      );
      expect(colorsContent).toMatch(
        /\.bg-gray-75\s*\{[^}]*background-color:\s*var\(--spectrum-global-color-gray-75\)/
      );
      expect(colorsContent).toMatch(
        /\.bg-gray-100\s*\{[^}]*background-color:\s*var\(--spectrum-global-color-gray-100\)/
      );
    });
  });

  describe('Layout Utilities', () => {
    const layoutPath = join(utilitiesDir, 'layout.css');
    let layoutContent: string;

    beforeAll(() => {
      if (existsSync(layoutPath)) {
        layoutContent = readFileSync(layoutPath, 'utf-8');
      }
    });

    it('should contain flex display utilities', () => {
      expect(layoutContent).toMatch(/\.flex\s*\{[^}]*display:\s*flex/);
      expect(layoutContent).toMatch(/\.flex-column\s*\{[^}]*flex-direction:\s*column/);
      expect(layoutContent).toMatch(/\.inline-flex\s*\{[^}]*display:\s*inline-flex/);
    });

    it('should contain flex alignment utilities', () => {
      expect(layoutContent).toMatch(/\.items-center\s*\{[^}]*align-items:\s*center/);
      expect(layoutContent).toMatch(/\.justify-between\s*\{[^}]*justify-content:\s*space-between/);
    });

    it('should contain dimension utilities', () => {
      expect(layoutContent).toMatch(/\.w-full\s*\{[^}]*width:\s*100%/);
      expect(layoutContent).toMatch(/\.h-full\s*\{[^}]*height:\s*100%/);
    });

    it('should contain display utilities', () => {
      expect(layoutContent).toMatch(/\.block\s*\{[^}]*display:\s*block/);
      expect(layoutContent).toMatch(/\.hidden\s*\{[^}]*display:\s*none/);
      expect(layoutContent).toMatch(/\.grid\s*\{[^}]*display:\s*grid/);
    });

    it('should contain overflow utilities', () => {
      expect(layoutContent).toMatch(/\.overflow-hidden\s*\{[^}]*overflow:\s*hidden/);
      expect(layoutContent).toMatch(/\.overflow-auto\s*\{[^}]*overflow:\s*auto/);
      expect(layoutContent).toMatch(/\.overflow-y-auto\s*\{[^}]*overflow-y:\s*auto/);
    });

    it('should contain position utilities', () => {
      expect(layoutContent).toMatch(/\.relative\s*\{[^}]*position:\s*relative/);
      expect(layoutContent).toMatch(/\.absolute\s*\{[^}]*position:\s*absolute/);
    });

    it('should contain z-index utilities', () => {
      expect(layoutContent).toMatch(/\.z-10\s*\{[^}]*z-index:\s*10/);
    });
  });

  describe('Spacing Utilities', () => {
    const spacingPath = join(utilitiesDir, 'spacing.css');
    let spacingContent: string;

    beforeAll(() => {
      if (existsSync(spacingPath)) {
        spacingContent = readFileSync(spacingPath, 'utf-8');
      }
    });

    it('should contain padding utilities', () => {
      expect(spacingContent).toMatch(/\.p-0\s*\{[^}]*padding:\s*0/);
      expect(spacingContent).toMatch(/\.p-2\s*\{[^}]*padding:\s*8px/);
      expect(spacingContent).toMatch(/\.p-3\s*\{[^}]*padding:\s*12px/);
      expect(spacingContent).toMatch(/\.p-4\s*\{[^}]*padding:\s*16px/);
    });

    it('should contain directional padding utilities', () => {
      expect(spacingContent).toMatch(/\.px-3\s*\{/);
      expect(spacingContent).toMatch(/\.py-2\s*\{/);
    });

    it('should contain margin utilities', () => {
      expect(spacingContent).toMatch(/\.m-0\s*\{[^}]*margin:\s*0/);
      expect(spacingContent).toMatch(/\.mb-2\s*\{[^}]*margin-bottom:\s*8px/);
      expect(spacingContent).toMatch(/\.mb-3\s*\{[^}]*margin-bottom:\s*12px/);
      expect(spacingContent).toMatch(/\.mb-4\s*\{[^}]*margin-bottom:\s*16px/);
    });

    it('should contain gap utilities', () => {
      expect(spacingContent).toMatch(/\.gap-2\s*\{[^}]*gap:\s*8px/);
      expect(spacingContent).toMatch(/\.gap-3\s*\{[^}]*gap:\s*12px/);
      expect(spacingContent).toMatch(/\.gap-4\s*\{[^}]*gap:\s*16px/);
    });
  });

  describe('Border Utilities', () => {
    const bordersPath = join(utilitiesDir, 'borders.css');
    let bordersContent: string;

    beforeAll(() => {
      if (existsSync(bordersPath)) {
        bordersContent = readFileSync(bordersPath, 'utf-8');
      }
    });

    it('should contain border utilities', () => {
      expect(bordersContent).toMatch(/\.border\s*\{[^}]*border:\s*1px solid/);
    });

    it('should contain border radius utilities', () => {
      expect(bordersContent).toMatch(/\.rounded\s*\{[^}]*border-radius:\s*4px/);
      expect(bordersContent).toMatch(/\.rounded-md\s*\{[^}]*border-radius:\s*6px/);
      expect(bordersContent).toMatch(/\.rounded-lg\s*\{[^}]*border-radius:\s*8px/);
      expect(bordersContent).toMatch(/\.rounded-full\s*\{[^}]*border-radius:\s*50%/);
    });
  });

  describe('File Size Constraints', () => {
    it('typography.css should be under 300 lines', () => {
      const content = readFileSync(join(utilitiesDir, 'typography.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });

    it('colors.css should be under 300 lines', () => {
      const content = readFileSync(join(utilitiesDir, 'colors.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });

    it('layout.css should be under 300 lines', () => {
      const content = readFileSync(join(utilitiesDir, 'layout.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });

    it('spacing.css should be under 300 lines', () => {
      const content = readFileSync(join(utilitiesDir, 'spacing.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });

    it('borders.css should be under 300 lines', () => {
      const content = readFileSync(join(utilitiesDir, 'borders.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });
  });
});
