/**
 * Layer Declaration Tests
 *
 * Validates the 5-layer CSS architecture declaration in index.css.
 * Part of CSS Architecture Improvement - Step 1: Layer Declaration Update
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Declaration', () => {
  const indexCSSPath = resolve(
    __dirname,
    '../../../../src/core/ui/styles/index.css'
  );
  let cssContent: string;

  beforeAll(() => {
    cssContent = readFileSync(indexCSSPath, 'utf-8');
  });

  describe('5-Layer Architecture', () => {
    it('declares exactly 5 layers in correct order', () => {
      expect(cssContent).toMatch(
        /@layer\s+reset\s*,\s*vscode-theme\s*,\s*spectrum\s*,\s*components\s*,\s*utilities\s*;/
      );
    });

    it('does not contain old 3-layer declaration', () => {
      expect(cssContent).not.toMatch(/@layer\s+reset\s*,\s*theme\s*,\s*overrides/);
    });

    it('has layer declaration before any @import statements', () => {
      const layerMatch = cssContent.match(/@layer\s+reset/);
      const importMatch = cssContent.match(/@import/);

      expect(layerMatch).not.toBeNull();
      expect(importMatch).not.toBeNull();

      const layerIndex = layerMatch!.index!;
      const importIndex = importMatch!.index!;

      expect(layerIndex).toBeLessThan(importIndex);
    });

    it('has exactly one top-level layer declaration', () => {
      // Match @layer declarations with layer names (not @layer {} blocks)
      const layerDeclarations = cssContent.match(
        /@layer\s+[\w-]+\s*(?:,\s*[\w-]+)*\s*;/g
      );

      expect(layerDeclarations).toHaveLength(1);
    });
  });

  describe('Declaration Positioning', () => {
    it('layer declaration is first non-comment CSS rule', () => {
      // Remove all CSS comments
      const withoutComments = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');
      // Trim whitespace
      const trimmed = withoutComments.trim();
      // First rule should start with @layer
      expect(trimmed).toMatch(/^@layer/);
    });
  });
});
