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
      // `vendor` was added to the order on 2026-09-09 — declared and empty, so
      // nothing wraps Spectrum's CSS in it yet and no rule changed position. The
      // canonical string is enforced byte-for-byte by `layerOrder` in
      // tests/sop/stylesheet-bundles.test.ts; this asserts index.css carries it.
      expect(indexCSS).toContain('@layer reset, vendor, theme, overrides;');
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
        // The ATTRIBUTE form, not `.spectrum-Button--cta`. This asserted the bare
        // class until 2026-09-08, and that selector never matched anything:
        // Spectrum ships HASHED class names (the real DOM class is
        // `o7Xu8a_spectrum-Button`), so a bare `.spectrum-Button--cta` cannot match.
        // The rule did its work through the `[class*=]` form sitting beside it, and
        // the assertion was pinning the dead half. Removing the 47 dead selectors
        // moved zero of 2,700 elements, which is what proved they were inert.
        expect(layerContent).toContain('[class*="spectrum-Button"][class*="cta"]');
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
