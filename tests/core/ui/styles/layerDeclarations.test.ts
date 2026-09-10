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

    /**
     * These two used to assert that index.css contained `@import './reset.css'`
     * and `@import './tokens.css'`. They passed for five months while NEITHER
     * SHEET REACHED A SINGLE BUNDLE.
     *
     * webpack's css-loader inlined those imports at build time. The esbuild
     * plugin that replaced it (580495214, 2026-04-13) reads each sheet as text
     * and passes `@import` through untouched, leaving the browser to resolve a
     * relative URL against a `vscode-webview://` document. It never resolved.
     * The old assertions checked the TEXT of the mechanism, so they agreed with
     * the implementation and neither agreed with reality.
     *
     * What replaces them checks DELIVERY: every bundle entry imports both sheets
     * itself, which is what the bundler follows and what ADR-017 §6 requires.
     */
    it('every bundle entry imports reset.css and tokens.css itself', () => {
      // Read the build config as TEXT. `require`-ing it pulls in esbuild, which
      // throws under this suite's jsdom environment ("Buffer.from('') instanceof
      // Uint8Array is incorrectly false").
      const config = readFileSync(resolve(__dirname, '../../../../esbuild.config.js'), 'utf-8');
      const block = /const WEBVIEW_ENTRIES = \{([\s\S]*?)\n\};/.exec(config);
      expect(block).not.toBeNull();
      const entries: string[] = [...(block as RegExpExecArray)[1].matchAll(/'([^']+\.tsx?)'/g)].map(
        (m) => m[1]
      );
      // Control: a mis-resolved list would make the loop below assert nothing.
      expect(entries).toHaveLength(8);

      const missing = entries.filter((e) => {
        const src = readFileSync(resolve(__dirname, '../../../../', e), 'utf-8');
        return !src.includes("styles/reset.css'") || !src.includes("styles/tokens.css'");
      });
      expect(missing).toStrictEqual([]);
    });

    it('index.css no longer uses @import — the build cannot resolve it', () => {
      expect(indexCSS).not.toMatch(/^\s*@import/m);
    });

    it('wraps base styles in @layer theme', () => {
      expect(indexCSS).toContain('@layer theme {');
    });
  });

  describe('utilities.css', () => {
    let customSpectrumCSS: string;

    beforeAll(() => {
      customSpectrumCSS = readFileSync(
        resolve(
          __dirname,
          '../../../../src/core/ui/styles/utilities.css'
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
