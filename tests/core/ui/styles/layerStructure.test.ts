/**
 * Layer Structure Tests
 *
 * Validates CSS files are wrapped in appropriate @layer blocks.
 * Part of CSS Architecture Improvement - Steps 3, 4, 5
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Layer Structure', () => {
  const stylesPath = resolve(__dirname, '../../../../src/core/ui/styles');

  describe('utilities/ files', () => {
    const utilityFiles = [
      'animations.css',
      'borders.css',
      'buttons.css',
      'colors.css',
      'layout.css',
      'spacing.css',
      'typography.css',
    ];

    it.each(utilityFiles)('%s is wrapped in @layer utilities', (file) => {
      const content = readFileSync(
        resolve(stylesPath, 'utilities', file),
        'utf-8'
      );
      // File should start with @layer utilities { and end with }
      // Allow for file header comments before @layer
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\/\s*/g, '').trim();
      expect(withoutComments).toMatch(/^@layer\s+utilities\s*\{[\s\S]*\}$/);
    });
  });

  // Note: spectrum/ directory was removed after React Aria migration
  // All Spectrum overrides are no longer needed

  describe('components/ files', () => {
    const componentFiles = [
      'cards.css',
      'common.css',
      'dashboard.css',
      'timeline.css',
    ];

    it.each(componentFiles)('%s is wrapped in @layer components', (file) => {
      const content = readFileSync(
        resolve(stylesPath, 'components', file),
        'utf-8'
      );
      // Allow for file header comments before @layer
      const withoutComments = content.replace(/\/\*[\s\S]*?\*\/\s*/g, '').trim();
      expect(withoutComments).toMatch(/^@layer\s+components\s*\{[\s\S]*\}$/);
    });
  });
});
