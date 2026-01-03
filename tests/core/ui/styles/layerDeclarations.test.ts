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
      // Updated for 4-layer architecture after React Aria migration
      expect(indexCSS).toContain('@layer reset, vscode-theme, components, utilities;');
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
      expect(indexCSS).toContain("@import './components/index.css'");
      // Note: spectrum/ directory removed after React Aria migration
    });
  });

  // Note: spectrum/buttons.css tests removed after React Aria migration

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
      expect(customSpectrumCSS).toContain("@import './components/index.css'");
      // Note: spectrum import removed after React Aria migration
    });
  });

  describe('wizard.css', () => {
    let wizardCSS: string;

    beforeAll(() => {
      wizardCSS = readFileSync(join(stylesDir, 'wizard.css'), 'utf-8');
    });

    it('wraps structural styles in @layer components', () => {
      expect(wizardCSS).toContain('@layer components {');
    });

    it('has .number-badge styles inside components layer', () => {
      const layerMatch = wizardCSS.match(/@layer components\s*\{([\s\S]*?)\n\}/);
      expect(layerMatch).toBeTruthy();
      if (layerMatch) {
        const layerContent = layerMatch[1];
        expect(layerContent).toContain('.number-badge');
      }
    });
  });
});
