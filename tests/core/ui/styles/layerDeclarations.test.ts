/**
 * CSS @layer Declaration Tests
 *
 * Validates that CSS files have proper cascade layer declarations
 * for predictable style ordering.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Declarations', () => {
  describe('index.css', () => {
    let indexCSS: string;

    beforeAll(() => {
      indexCSS = readFileSync(
        resolve(__dirname, '../../../../src/core/ui/styles/index.css'),
        'utf-8'
      );
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
  });

  describe('custom-spectrum.css', () => {
    let customSpectrumCSS: string;

    beforeAll(() => {
      customSpectrumCSS = readFileSync(
        resolve(
          __dirname,
          '../../../../src/core/ui/styles/custom-spectrum.css'
        ),
        'utf-8'
      );
    });

    it('wraps CTA button overrides in @layer overrides', () => {
      expect(customSpectrumCSS).toContain('@layer overrides {');
    });

    it('has CTA button styles inside overrides layer', () => {
      // Find the overrides layer content
      const layerMatch = customSpectrumCSS.match(
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

  describe('wizard.css', () => {
    let wizardCSS: string;

    beforeAll(() => {
      wizardCSS = readFileSync(
        resolve(__dirname, '../../../../src/core/ui/styles/wizard.css'),
        'utf-8'
      );
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
