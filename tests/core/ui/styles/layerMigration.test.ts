/**
 * Layer Migration Tests
 *
 * Validates CSS files use the new 5-layer architecture layer names.
 * Part of CSS Architecture Improvement - Step 2: Layer Migration
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Migration', () => {
  const stylesPath = resolve(
    __dirname,
    '../../../../src/core/ui/styles'
  );

  describe('vscode-theme layer assignment', () => {
    it('tokens.css uses @layer vscode-theme', () => {
      const content = readFileSync(resolve(stylesPath, 'tokens.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+vscode-theme\s*\{/);
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });

    it('vscode-theme.css uses @layer vscode-theme', () => {
      const content = readFileSync(resolve(stylesPath, 'vscode-theme.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+vscode-theme\s*\{/);
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });
  });

  describe('components layer assignment', () => {
    it('wizard.css uses @layer components', () => {
      const content = readFileSync(resolve(stylesPath, 'wizard.css'), 'utf-8');
      // Should have components layer blocks
      expect(content).toMatch(/@layer\s+components\s*\{/);
      // Should NOT have theme layer blocks
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
    });
  });

  describe('spectrum layer assignment', () => {
    it('spectrum/buttons.css uses @layer spectrum', () => {
      const content = readFileSync(resolve(stylesPath, 'spectrum/buttons.css'), 'utf-8');
      expect(content).toMatch(/@layer\s+spectrum\s*\{/);
      expect(content).not.toMatch(/@layer\s+overrides\s*\{/);
    });
  });

  describe('deprecated layer names removed', () => {
    const filesToCheck = [
      'tokens.css',
      'vscode-theme.css',
      'wizard.css',
      'spectrum/buttons.css',
    ];

    it.each(filesToCheck)('%s does not contain deprecated layer names', (file) => {
      const content = readFileSync(resolve(stylesPath, file), 'utf-8');
      // @layer theme { is deprecated (but @layer vscode-theme { is valid)
      expect(content).not.toMatch(/@layer\s+theme\s*\{/);
      // @layer overrides { is deprecated (but @layer spectrum { is valid)
      expect(content).not.toMatch(/@layer\s+overrides\s*\{/);
    });
  });
});
