/**
 * Keyframe Centralization Tests
 *
 * Validates that all common @keyframes are defined in a single canonical location:
 * utilities/animations.css
 *
 * This follows CSS architecture best practices identified in research:
 * - Centralized keyframe definitions prevent duplication
 * - Single source of truth for animations
 * - Animation utility classes reference centralized keyframes
 *
 * Part of CSS Architecture Improvement - Keyframe Centralization
 * Updated for CSS Utility Modularization
 *
 * Migration Notes:
 * - timeline.css keyframes now in TimelineNav.module.css
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

describe('Keyframe Centralization', () => {
  const projectRoot = resolve(__dirname, '../../../..');
  const stylesDir = resolve(projectRoot, 'src/core/ui/styles');
  const animationsPath = resolve(stylesDir, 'utilities/animations.css');
  const timelineModulePath = resolve(projectRoot, 'src/core/ui/components/TimelineNav.module.css');

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

  // Count occurrences of a specific @keyframes in a CSS file
  function countKeyframes(content: string, name: string): number {
    const regex = new RegExp(`@keyframes\\s+${name}\\s*\\{`, 'g');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  describe('Centralized Animations File', () => {
    it('should have utilities/animations.css file', () => {
      expect(existsSync(animationsPath)).toBe(true);
    });

    it('should be imported in utilities/index.css', () => {
      const utilsIndexPath = resolve(stylesDir, 'utilities/index.css');
      const content = readFileSync(utilsIndexPath, 'utf-8');
      expect(content).toMatch(/@import\s+['"]\.\/animations\.css['"]/);
    });
  });

  describe('Common Keyframes in Canonical Location', () => {
    // These keyframes should ONLY exist in utilities/animations.css
    const commonKeyframes = ['spin', 'pulse', 'fadeIn', 'fadeInUp'];

    it.each(commonKeyframes)('should have @keyframes %s in animations.css', (name) => {
      const content = readFileSync(animationsPath, 'utf-8');
      expect(content).toMatch(new RegExp(`@keyframes\\s+${name}\\s*\\{`));
    });

    it.each(commonKeyframes)('should have @keyframes %s defined exactly once across all CSS files', (name) => {
      const cssFiles = getAllCssFiles();
      let totalCount = 0;
      const filesWithKeyframe: string[] = [];

      for (const filePath of cssFiles) {
        const content = readFileSync(filePath, 'utf-8');
        const count = countKeyframes(content, name);
        if (count > 0) {
          totalCount += count;
          filesWithKeyframe.push(filePath.replace(stylesDir, ''));
        }
      }

      expect(totalCount).toBe(1);
      expect(filesWithKeyframe.length).toBe(1);
      expect(filesWithKeyframe[0]).toBe('/utilities/animations.css');
    });
  });

  describe('No Common Keyframes in Other Files', () => {
    it('should NOT have common keyframes in index.css', () => {
      const indexCssPath = resolve(stylesDir, 'index.css');
      const content = readFileSync(indexCssPath, 'utf-8');

      // These should have been moved to animations.css
      expect(countKeyframes(content, 'pulse')).toBe(0);
      expect(countKeyframes(content, 'fadeIn')).toBe(0);
    });

    it('should NOT have @keyframes spin in components/common.css', () => {
      const commonCssPath = resolve(stylesDir, 'components/common.css');
      const content = readFileSync(commonCssPath, 'utf-8');
      expect(countKeyframes(content, 'spin')).toBe(0);
    });

    // Note: spectrum/components.css test removed after React Aria migration
  });

  describe('Component-Specific Keyframes (CSS Modules)', () => {
    // Timeline animations are component-specific and now in TimelineNav.module.css
    it('should have timeline animation keyframes in TimelineNav.module.css', () => {
      const content = readFileSync(timelineModulePath, 'utf-8');

      // Timeline has enter/exit keyframes (component-specific, now in CSS Module)
      expect(content).toMatch(/@keyframes\s+timelineEnter\s*\{/);
      expect(content).toMatch(/@keyframes\s+timelineExit\s*\{/);
    });
  });

  describe('Animation Utility Classes', () => {
    it('should have .animate-fade-in class in utilities/layout.css', () => {
      const layoutCssPath = resolve(stylesDir, 'utilities/layout.css');
      const content = readFileSync(layoutCssPath, 'utf-8');
      expect(content).toMatch(/\.animate-fade-in\s*\{[^}]*animation:[^}]*fadeIn/);
    });

    it('should have .animate-pulse class in utilities/layout.css', () => {
      const layoutCssPath = resolve(stylesDir, 'utilities/layout.css');
      const content = readFileSync(layoutCssPath, 'utf-8');
      expect(content).toMatch(/\.animate-pulse\s*\{[^}]*animation:/);
    });

    it('should have .animate-spin class in animations.css', () => {
      const content = readFileSync(animationsPath, 'utf-8');
      expect(content).toMatch(/\.animate-spin\s*\{[^}]*animation:[^}]*spin/);
    });
  });

  describe('Keyframe Definitions Are Correct', () => {
    it('should have correct spin keyframe (rotation)', () => {
      const content = readFileSync(animationsPath, 'utf-8');
      expect(content).toMatch(/@keyframes\s+spin\s*\{[^}]*rotate\(360deg\)/);
    });

    it('should have correct pulse keyframe (opacity variation)', () => {
      const content = readFileSync(animationsPath, 'utf-8');
      expect(content).toMatch(/@keyframes\s+pulse\s*\{[^}]*opacity/);
    });

    it('should have correct fadeIn keyframe (opacity 0 to 1)', () => {
      const content = readFileSync(animationsPath, 'utf-8');
      const pattern = /@keyframes\s+fadeIn\s*\{[^}]*from\s*\{\s*opacity:\s*0;?\s*\}[^}]*to\s*\{\s*opacity:\s*1;?\s*\}/;
      expect(content).toMatch(pattern);
    });

    it('should have correct fadeInUp keyframe (opacity + translate)', () => {
      const content = readFileSync(animationsPath, 'utf-8');
      expect(content).toMatch(/@keyframes\s+fadeInUp\s*\{[^}]*opacity[^}]*translateY/);
    });
  });
});
