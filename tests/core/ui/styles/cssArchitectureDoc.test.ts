/**
 * CSS Architecture Documentation Tests
 *
 * Validates that the CSS architecture is formally documented,
 * following the research recommendation to document conventions.
 *
 * Part of CSS Architecture Improvement - Documentation Gap
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Architecture Documentation', () => {
  const projectRoot = resolve(__dirname, '../../../..');
  const stylesDir = resolve(projectRoot, 'src/core/ui/styles');
  const claudeMdPath = resolve(stylesDir, 'CLAUDE.md');

  describe('Documentation File Exists', () => {
    it('should have CLAUDE.md in styles directory', () => {
      expect(existsSync(claudeMdPath)).toBe(true);
    });
  });

  describe('Architecture Sections', () => {
    let content: string;

    beforeAll(() => {
      if (existsSync(claudeMdPath)) {
        content = readFileSync(claudeMdPath, 'utf-8');
      }
    });

    it('should document the hybrid approach (semantic + utilities)', () => {
      expect(content).toMatch(/hybrid|semantic.*utility|utility.*semantic/i);
    });

    it('should document the @layer cascade system', () => {
      expect(content).toMatch(/@layer/);
    });

    it('should document utility classes', () => {
      expect(content).toMatch(/utilities?/i);
    });

    it('should document CSS Modules for features', () => {
      expect(content).toMatch(/CSS\s*Module/i);
    });

    it('should document the directory structure', () => {
      expect(content).toMatch(/utilities\//);
      expect(content).toMatch(/components\//);
      expect(content).toMatch(/spectrum\//);
    });

    it('should document animation/keyframe centralization', () => {
      expect(content).toMatch(/animations?\.css|keyframe/i);
    });
  });

  describe('Best Practices Section', () => {
    let content: string;

    beforeAll(() => {
      if (existsSync(claudeMdPath)) {
        content = readFileSync(claudeMdPath, 'utf-8');
      }
    });

    it('should mention Spectrum integration approach', () => {
      expect(content).toMatch(/Spectrum/i);
    });

    it('should mention VS Code theme integration', () => {
      expect(content).toMatch(/--vscode-|VS\s*Code\s*theme/i);
    });
  });
});
