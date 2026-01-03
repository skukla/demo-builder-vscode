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
        'buttons.css',
        'animations.css',
      ];

      for (const file of expectedFiles) {
        const filePath = join(utilitiesDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  // Note: Spectrum Directory tests removed after React Aria migration

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
        'buttons.css',
        'animations.css',
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

    // Note: Spectrum size constraints removed after React Aria migration

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
