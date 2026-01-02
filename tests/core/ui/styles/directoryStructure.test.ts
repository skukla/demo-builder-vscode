/**
 * CSS Directory Structure Tests
 *
 * Validates that the modular CSS directory structure exists
 * with proper barrel files for each category.
 *
 * Part of CSS Utility Modularization - Step 1: Directory Structure
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('CSS Directory Structure', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');

  describe('Utilities Directory', () => {
    const utilitiesDir = join(stylesDir, 'utilities');

    it('should have utilities directory', () => {
      expect(existsSync(utilitiesDir)).toBe(true);
    });

    it('should have utilities/index.css barrel file', () => {
      const indexPath = join(utilitiesDir, 'index.css');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should have utilities/index.css with proper @import structure', () => {
      const indexPath = join(utilitiesDir, 'index.css');
      const content = readFileSync(indexPath, 'utf-8');

      // Should import utility category files
      expect(content).toMatch(/@import ['"]\.\/typography\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/colors\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/layout\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/spacing\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/borders\.css['"]/);
    });

    it('should have all utility category files', () => {
      const expectedFiles = [
        'typography.css',
        'colors.css',
        'layout.css',
        'spacing.css',
        'borders.css',
      ];

      for (const file of expectedFiles) {
        const filePath = join(utilitiesDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('Spectrum Directory', () => {
    const spectrumDir = join(stylesDir, 'spectrum');

    it('should have spectrum directory', () => {
      expect(existsSync(spectrumDir)).toBe(true);
    });

    it('should have spectrum/index.css barrel file', () => {
      const indexPath = join(spectrumDir, 'index.css');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should have spectrum/index.css with proper @import structure', () => {
      const indexPath = join(spectrumDir, 'index.css');
      const content = readFileSync(indexPath, 'utf-8');

      // Should import Spectrum override files
      expect(content).toMatch(/@import ['"]\.\/buttons\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/components\.css['"]/);
    });

    it('should have all Spectrum category files', () => {
      const expectedFiles = ['buttons.css', 'components.css'];

      for (const file of expectedFiles) {
        const filePath = join(spectrumDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('Components Directory', () => {
    const componentsDir = join(stylesDir, 'components');

    it('should have components directory', () => {
      expect(existsSync(componentsDir)).toBe(true);
    });

    it('should have components/index.css barrel file', () => {
      const indexPath = join(componentsDir, 'index.css');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should have components/index.css with proper @import structure', () => {
      const indexPath = join(componentsDir, 'index.css');
      const content = readFileSync(indexPath, 'utf-8');

      // Should import component category files
      expect(content).toMatch(/@import ['"]\.\/cards\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/timeline\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/dashboard\.css['"]/);
      expect(content).toMatch(/@import ['"]\.\/common\.css['"]/);
    });

    it('should have all component category files', () => {
      const expectedFiles = [
        'cards.css',
        'timeline.css',
        'dashboard.css',
        'common.css',
      ];

      for (const file of expectedFiles) {
        const filePath = join(componentsDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('Directory Size Constraints', () => {
    it('each utility file should be under 300 lines', () => {
      const utilitiesDir = join(stylesDir, 'utilities');
      const files = [
        'typography.css',
        'colors.css',
        'layout.css',
        'spacing.css',
        'borders.css',
      ];

      for (const file of files) {
        const filePath = join(utilitiesDir, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThanOrEqual(300);
        }
      }
    });

    it('each Spectrum file should be under 300 lines', () => {
      const spectrumDir = join(stylesDir, 'spectrum');
      const files = ['buttons.css', 'components.css'];

      for (const file of files) {
        const filePath = join(spectrumDir, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThanOrEqual(300);
        }
      }
    });

    it('each component file should be under 500 lines', () => {
      const componentsDir = join(stylesDir, 'components');
      const files = ['cards.css', 'timeline.css', 'dashboard.css', 'common.css'];

      for (const file of files) {
        const filePath = join(componentsDir, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8');
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThanOrEqual(500);
        }
      }
    });
  });
});
