/**
 * Keyframe Deduplication Tests
 *
 * Validates that @keyframes fadeIn is defined exactly once across all CSS files
 * in src/core/ui/styles/, with the canonical definition in index.css.
 *
 * Part of CSS Architecture Improvement - Step 2: Fix Keyframe Duplication
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

describe('Keyframe Deduplication', () => {
  const projectRoot = resolve(__dirname, '../../../..');
  const stylesDir = resolve(projectRoot, 'src/core/ui/styles');

  // Read all CSS files in the styles directory
  function getCssFiles(): string[] {
    return readdirSync(stylesDir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => join(stylesDir, file));
  }

  // Count occurrences of @keyframes fadeIn in a CSS file
  function countFadeInKeyframes(content: string): number {
    const matches = content.match(/@keyframes\s+fadeIn\s*\{/g);
    return matches ? matches.length : 0;
  }

  describe('Single Definition Requirement', () => {
    it('should have @keyframes fadeIn defined exactly once across all CSS files', () => {
      const cssFiles = getCssFiles();
      let totalCount = 0;
      const filesWithFadeIn: string[] = [];

      for (const filePath of cssFiles) {
        const content = readFileSync(filePath, 'utf-8');
        const count = countFadeInKeyframes(content);
        if (count > 0) {
          totalCount += count;
          filesWithFadeIn.push(filePath);
        }
      }

      expect(totalCount).toBe(1);
      expect(filesWithFadeIn.length).toBe(1);
    });
  });

  describe('Canonical Location', () => {
    it('should have @keyframes fadeIn defined in index.css', () => {
      const indexCssPath = resolve(stylesDir, 'index.css');
      const content = readFileSync(indexCssPath, 'utf-8');

      // Check that fadeIn keyframe exists in index.css
      expect(content).toMatch(/@keyframes\s+fadeIn\s*\{/);
    });

    it('should have the correct canonical fadeIn animation in index.css', () => {
      const indexCssPath = resolve(stylesDir, 'index.css');
      const content = readFileSync(indexCssPath, 'utf-8');

      // The canonical fadeIn should be a simple opacity animation
      // Match the pattern: @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      const fadeInPattern =
        /@keyframes\s+fadeIn\s*\{[^}]*from\s*\{\s*opacity:\s*0;?\s*\}[^}]*to\s*\{\s*opacity:\s*1;?\s*\}/;
      expect(content).toMatch(fadeInPattern);
    });
  });

  describe('No Duplicate in custom-spectrum.css', () => {
    it('should NOT have @keyframes fadeIn in custom-spectrum.css', () => {
      const customSpectrumPath = resolve(stylesDir, 'custom-spectrum.css');
      const content = readFileSync(customSpectrumPath, 'utf-8');

      // This test should FAIL before we remove the duplicate
      // The duplicate exists at line 904 in custom-spectrum.css
      const count = countFadeInKeyframes(content);
      expect(count).toBe(0);
    });

    it('should reference fadeIn animation from index.css in classes', () => {
      const customSpectrumPath = resolve(stylesDir, 'custom-spectrum.css');
      const content = readFileSync(customSpectrumPath, 'utf-8');

      // Classes that use fadeIn animation should still work
      // (the keyframe is defined in index.css and imported)
      // Look for animation: fadeIn usage (classes referencing the keyframe)
      expect(content).toMatch(/animation:\s*fadeIn/);
    });
  });

  describe('Other Keyframes Remain Intact', () => {
    // fadeInUp is a DIFFERENT keyframe that should NOT be removed
    it('should retain @keyframes fadeInUp in custom-spectrum.css', () => {
      const customSpectrumPath = resolve(stylesDir, 'custom-spectrum.css');
      const content = readFileSync(customSpectrumPath, 'utf-8');

      expect(content).toMatch(/@keyframes\s+fadeInUp\s*\{/);
    });

    // Note: @keyframes expandIn was migrated to project-creation.module.css (Step 6)
    // It's now in the feature-scoped CSS Module for BrandGallery component.

    it('should retain @keyframes slide-down in custom-spectrum.css', () => {
      const customSpectrumPath = resolve(stylesDir, 'custom-spectrum.css');
      const content = readFileSync(customSpectrumPath, 'utf-8');

      expect(content).toMatch(/@keyframes\s+slide-down\s*\{/);
    });

    it('should retain @keyframes pulse in index.css', () => {
      const indexCssPath = resolve(stylesDir, 'index.css');
      const content = readFileSync(indexCssPath, 'utf-8');

      expect(content).toMatch(/@keyframes\s+pulse\s*\{/);
    });
  });

  describe('Animation Classes Still Work', () => {
    it('should have .animate-fade-in class that uses fadeIn animation', () => {
      const customSpectrumPath = resolve(stylesDir, 'custom-spectrum.css');
      const content = readFileSync(customSpectrumPath, 'utf-8');

      // The .animate-fade-in class should use animation: fadeIn
      expect(content).toMatch(/\.animate-fade-in\s*\{[^}]*animation:[^}]*fadeIn/);
    });

    // Note: .brand-card-architectures was removed as dead CSS during Step 6 migration
    // (not referenced in any source files). The fadeIn animation is still used by
    // .animate-fade-in and remains properly defined in index.css.
  });
});
