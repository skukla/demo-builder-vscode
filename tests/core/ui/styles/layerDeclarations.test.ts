/**
 * CSS @layer Declaration Tests
 *
 * Validates that CSS files have proper cascade layer declarations
 * for predictable style ordering.
 *
 * Updated for CSS Utility Modularization
 */
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('CSS Layer Declarations', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');

  describe('index.css', () => {
    let indexCSS: string;

    beforeAll(() => {
      indexCSS = readFileSync(join(stylesDir, 'index.css'), 'utf-8');
    });

    it('declares layer order at top of file', () => {
      expect(indexCSS).toContain('@layer reset, theme, overrides;');
    });

    it('imports reset.css', () => {
      expect(indexCSS).toMatch(/@import.*reset\.css/);
    });

    it('imports tokens.css', () => {
      expect(indexCSS).toMatch(/@import.*tokens\.css/);
    });

    it('wraps base styles in @layer theme', () => {
      expect(indexCSS).toContain('@layer theme {');
    });

    it('imports modular CSS directories', () => {
      expect(indexCSS).toContain("@import './utilities/index.css'");
      expect(indexCSS).toContain("@import './spectrum/index.css'");
      expect(indexCSS).toContain("@import './components/index.css'");
    });
  });

  describe('spectrum/buttons.css', () => {
    let buttonsCss: string;

    beforeAll(() => {
      buttonsCss = readFileSync(join(stylesDir, 'spectrum/buttons.css'), 'utf-8');
    });

    it('wraps CTA button overrides in @layer overrides', () => {
      expect(buttonsCss).toContain('@layer overrides {');
    });

    it('has CTA button styles inside overrides layer', () => {
      // Find the overrides layer content
      const layerMatch = buttonsCss.match(
        /@layer overrides\s*\{([\s\S]*?)\n\}/
      );
      expect(layerMatch).toBeTruthy();
      if (layerMatch) {
        const layerContent = layerMatch[1];
        expect(layerContent).toContain('.spectrum-Button--cta');
        expect(layerContent).toContain('var(--db-cta-background)'); // Tangerine token
      }
    });
  });

  describe('custom-spectrum.css (deprecated)', () => {
    let customSpectrumCSS: string;

    beforeAll(() => {
      customSpectrumCSS = readFileSync(
        join(stylesDir, 'custom-spectrum.css'),
        'utf-8'
      );
    });

    it('is now a minimal re-export stub', () => {
      const lineCount = customSpectrumCSS.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(100);
    });

    it('imports modular files for backwards compatibility', () => {
      expect(customSpectrumCSS).toContain("@import './utilities/index.css'");
      expect(customSpectrumCSS).toContain("@import './spectrum/index.css'");
      expect(customSpectrumCSS).toContain("@import './components/index.css'");
    });
  });

  describe('wizard.css', () => {
    let wizardCSS: string;

    beforeAll(() => {
      wizardCSS = readFileSync(join(stylesDir, 'wizard.css'), 'utf-8');
    });

    it('wraps structural styles in @layer theme', () => {
      expect(wizardCSS).toContain('@layer theme {');
    });

    it('has .number-badge styles inside theme layer', () => {
      const layerMatch = wizardCSS.match(/@layer theme\s*\{([\s\S]*?)\n\}/);
      expect(layerMatch).toBeTruthy();
      if (layerMatch) {
        const layerContent = layerMatch[1];
        expect(layerContent).toContain('.number-badge');
      }
    });
  });
});
