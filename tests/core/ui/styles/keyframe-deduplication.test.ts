/**
 * Keyframe Deduplication Tests
 *
 * Validates that @keyframes fadeIn is defined exactly once across all CSS files
 * in src/core/ui/styles/, with the canonical definition in index.css.
 *
 * Part of CSS Architecture Improvement - Step 2: Fix Keyframe Duplication
 * Updated for CSS Utility Modularization
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

describe('Keyframe Deduplication', () => {
  const projectRoot = resolve(__dirname, '../../../..');
  const stylesDir = resolve(projectRoot, 'src/core/ui/styles');

  // Read all CSS files in the styles directory and subdirectories
  function getAllCssFiles(dir: string = stylesDir): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllCssFiles(fullPath));
      } else if (entry.name.endsWith('.css')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  // Count occurrences of @keyframes fadeIn in a CSS file
  function countFadeInKeyframes(content: string): number {
    const matches = content.match(/@keyframes\s+fadeIn\s*\{/g);
    return matches ? matches.length : 0;
  }

  // Helper to read and combine modular CSS files
  const readModularCSS = () => {
    const files = [
      'utilities/layout.css',
      'components/common.css',
      'components/timeline.css',
    ];
    return files
      .filter((f) => existsSync(join(stylesDir, f)))
      .map((f) => readFileSync(join(stylesDir, f), 'utf-8'))
      .join('\n');
  };

  describe('Single Definition Requirement', () => {
    it('should have @keyframes fadeIn defined exactly once across all CSS files', () => {
      const cssFiles = getAllCssFiles();
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

      // custom-spectrum.css should not contain @keyframes fadeIn
      const count = countFadeInKeyframes(content);
      expect(count).toBe(0);
    });

    it('should have animation classes in modular files that use fadeIn', () => {
      // Animation classes now live in modular files (utilities/layout.css)
      const layoutCssPath = resolve(stylesDir, 'utilities/layout.css');
      const content = readFileSync(layoutCssPath, 'utf-8');

      // Look for animation: fadeIn usage (classes referencing the keyframe)
      expect(content).toMatch(/animation:\s*fadeIn/);
    });
  });

  describe('Other Keyframes Remain Intact', () => {
    // These keyframes are now in the modular files or timeline
    it('should retain timeline animation keyframes in components/timeline.css', () => {
      const timelineCssPath = resolve(stylesDir, 'components/timeline.css');
      const content = readFileSync(timelineCssPath, 'utf-8');

      // Timeline has enter/exit keyframes
      expect(content).toMatch(/@keyframes\s+timeline-enter\s*\{/);
      expect(content).toMatch(/@keyframes\s+timeline-exit\s*\{/);
    });

    it('should retain @keyframes pulse in index.css', () => {
      const indexCssPath = resolve(stylesDir, 'index.css');
      const content = readFileSync(indexCssPath, 'utf-8');

      expect(content).toMatch(/@keyframes\s+pulse\s*\{/);
    });

    it('should retain @keyframes spin in components/common.css (loading spinner)', () => {
      const commonCssPath = resolve(stylesDir, 'components/common.css');
      const content = readFileSync(commonCssPath, 'utf-8');

      expect(content).toMatch(/@keyframes\s+spin\s*\{/);
    });
  });

  describe('Animation Classes Still Work', () => {
    it('should have .animate-fade-in class that uses fadeIn animation', () => {
      // animate-fade-in is now in utilities/layout.css
      const layoutCssPath = resolve(stylesDir, 'utilities/layout.css');
      const content = readFileSync(layoutCssPath, 'utf-8');

      // The .animate-fade-in class should use animation: fadeIn
      expect(content).toMatch(/\.animate-fade-in\s*\{[^}]*animation:[^}]*fadeIn/);
    });

    it('should have .animate-pulse class that uses pulse animation', () => {
      // animate-pulse is now in utilities/layout.css
      const layoutCssPath = resolve(stylesDir, 'utilities/layout.css');
      const content = readFileSync(layoutCssPath, 'utf-8');

      expect(content).toMatch(/\.animate-pulse\s*\{[^}]*animation:/);
    });
  });
});
