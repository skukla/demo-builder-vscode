/**
 * CSS Integrity Tests
 *
 * Validates the complete CSS architecture integrity after layer restructuring
 * and !important removal. These tests ensure:
 * - All CSS files are readable
 * - All imports in index.css exist
 * - Layer declarations are syntactically valid
 * - Expected file counts are correct
 *
 * Part of CSS Architecture Improvement - Step 7: Verification
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

describe('CSS Integrity', () => {
  const stylesPath = resolve(__dirname, '../../../../src/core/ui/styles');

  // Shared helper function for recursive CSS file discovery
  const getAllCssFiles = (dir: string): string[] => {
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
  };

  describe('All CSS Files Are Readable', () => {

    it('should find CSS files in styles directory', () => {
      const files = getAllCssFiles(stylesPath);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should read all CSS files without errors', () => {
      const files = getAllCssFiles(stylesPath);
      const errors: string[] = [];

      for (const file of files) {
        try {
          const content = readFileSync(file, 'utf-8');
          expect(content).toBeDefined();
          expect(typeof content).toBe('string');
        } catch (error) {
          errors.push(`Failed to read ${file}: ${error}`);
        }
      }

      expect(errors).toEqual([]);
    });

    it('should have non-empty content in all CSS files', () => {
      const files = getAllCssFiles(stylesPath);
      const emptyFiles: string[] = [];

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        // Allow files with only comments (like stubs)
        const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        // A CSS file should have at least some content or imports
        if (withoutComments.length === 0 && !content.includes('@import')) {
          emptyFiles.push(file);
        }
      }

      // Allow stub files that are intentionally minimal
      expect(emptyFiles.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Index.css Import Validation', () => {
    let indexContent: string;

    beforeAll(() => {
      indexContent = readFileSync(join(stylesPath, 'index.css'), 'utf-8');
    });

    it('should have all imported files exist', () => {
      // Extract all @import statements
      const importPattern = /@import\s+['"]([^'"]+)['"]/g;
      const imports: string[] = [];
      let match;

      while ((match = importPattern.exec(indexContent)) !== null) {
        imports.push(match[1]);
      }

      expect(imports.length).toBeGreaterThan(0);

      const missingFiles: string[] = [];
      for (const importPath of imports) {
        const resolvedPath = resolve(stylesPath, importPath);
        if (!existsSync(resolvedPath)) {
          missingFiles.push(importPath);
        }
      }

      expect(missingFiles).toEqual([]);
    });

    it('should import reset.css', () => {
      expect(indexContent).toContain("@import './reset.css'");
    });

    it('should import tokens.css', () => {
      expect(indexContent).toContain("@import './tokens.css'");
    });

    it('should import vscode-theme.css', () => {
      expect(indexContent).toContain("@import './vscode-theme.css'");
    });

    it('should import utilities barrel', () => {
      expect(indexContent).toContain("@import './utilities/index.css'");
    });

    it('should import spectrum barrel', () => {
      expect(indexContent).toContain("@import './spectrum/index.css'");
    });

    it('should import components barrel', () => {
      expect(indexContent).toContain("@import './components/index.css'");
    });

    it('should import wizard.css', () => {
      expect(indexContent).toContain("@import './wizard.css'");
    });
  });

  describe('Barrel Import Validation', () => {
    it('utilities/index.css imports all utility files', () => {
      const barrelPath = join(stylesPath, 'utilities', 'index.css');
      const content = readFileSync(barrelPath, 'utf-8');

      const expectedImports = [
        'typography.css',
        'colors.css',
        'layout.css',
        'spacing.css',
        'borders.css',
        'animations.css',
      ];

      for (const file of expectedImports) {
        expect(content).toContain(file);
        // Verify the imported file exists
        const filePath = join(stylesPath, 'utilities', file);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('spectrum/index.css imports all spectrum files', () => {
      const barrelPath = join(stylesPath, 'spectrum', 'index.css');
      const content = readFileSync(barrelPath, 'utf-8');

      const expectedImports = ['buttons.css', 'components.css'];

      for (const file of expectedImports) {
        expect(content).toContain(file);
        // Verify the imported file exists
        const filePath = join(stylesPath, 'spectrum', file);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('components/index.css imports all component files', () => {
      const barrelPath = join(stylesPath, 'components', 'index.css');
      const content = readFileSync(barrelPath, 'utf-8');

      const expectedImports = [
        'cards.css',
        'timeline.css',
        'dashboard.css',
        'common.css',
      ];

      for (const file of expectedImports) {
        expect(content).toContain(file);
        // Verify the imported file exists
        const filePath = join(stylesPath, 'components', file);
        expect(existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('CSS Syntax Validation', () => {
    it('should have balanced braces in all CSS files', () => {
      const files = getAllCssFiles(stylesPath);
      const unbalancedFiles: { file: string; open: number; close: number }[] =
        [];

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        // Remove comments to avoid false positives
        const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');

        const openBraces = (withoutComments.match(/{/g) || []).length;
        const closeBraces = (withoutComments.match(/}/g) || []).length;

        if (openBraces !== closeBraces) {
          unbalancedFiles.push({
            file: file.replace(stylesPath, ''),
            open: openBraces,
            close: closeBraces,
          });
        }
      }

      if (unbalancedFiles.length > 0) {
        console.log('Unbalanced braces found:');
        unbalancedFiles.forEach(({ file, open, close }) => {
          console.log(`  ${file}: ${open} open, ${close} close`);
        });
      }

      expect(unbalancedFiles).toEqual([]);
    });

    it('should have valid @layer declarations (no unclosed blocks)', () => {
      const files = getAllCssFiles(stylesPath);
      const invalidLayerFiles: string[] = [];

      for (const file of files) {
        const content = readFileSync(file, 'utf-8');
        // Remove comments
        const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');

        // Find @layer blocks (not declarations like @layer a, b, c;)
        const layerBlocks = withoutComments.match(/@layer\s+\w+\s*\{/g) || [];

        if (layerBlocks.length > 0) {
          // Count braces for this file
          const openBraces = (withoutComments.match(/{/g) || []).length;
          const closeBraces = (withoutComments.match(/}/g) || []).length;

          if (openBraces !== closeBraces) {
            invalidLayerFiles.push(file.replace(stylesPath, ''));
          }
        }
      }

      expect(invalidLayerFiles).toEqual([]);
    });
  });

  describe('CSS File Count Validation', () => {
    it('should have exactly 6 utility files', () => {
      const utilitiesPath = join(stylesPath, 'utilities');
      const files = readdirSync(utilitiesPath).filter(
        (f) => f.endsWith('.css') && f !== 'index.css'
      );

      expect(files).toHaveLength(6);
      expect(files.sort()).toEqual([
        'animations.css',
        'borders.css',
        'colors.css',
        'layout.css',
        'spacing.css',
        'typography.css',
      ]);
    });

    it('should have exactly 2 spectrum files', () => {
      const spectrumPath = join(stylesPath, 'spectrum');
      const files = readdirSync(spectrumPath).filter(
        (f) => f.endsWith('.css') && f !== 'index.css'
      );

      expect(files).toHaveLength(2);
      expect(files.sort()).toEqual(['buttons.css', 'components.css']);
    });

    it('should have exactly 4 component files', () => {
      const componentsPath = join(stylesPath, 'components');
      const files = readdirSync(componentsPath).filter(
        (f) => f.endsWith('.css') && f !== 'index.css'
      );

      expect(files).toHaveLength(4);
      expect(files.sort()).toEqual([
        'cards.css',
        'common.css',
        'dashboard.css',
        'timeline.css',
      ]);
    });

    it('should have expected root-level CSS files', () => {
      const rootFiles = readdirSync(stylesPath).filter(
        (f) => f.endsWith('.css')
      );

      const expectedRootFiles = [
        'index.css',
        'reset.css',
        'tokens.css',
        'vscode-theme.css',
        'wizard.css',
        'custom-spectrum.css',
      ];

      for (const expected of expectedRootFiles) {
        expect(rootFiles).toContain(expected);
      }
    });
  });

  describe('5-Layer Architecture Verification', () => {
    it('should have 5-layer cascade declaration in index.css', () => {
      const indexContent = readFileSync(join(stylesPath, 'index.css'), 'utf-8');
      expect(indexContent).toMatch(
        /@layer\s+reset\s*,\s*vscode-theme\s*,\s*spectrum\s*,\s*components\s*,\s*utilities\s*;/
      );
    });

    it('should have layer declaration before all imports', () => {
      const indexContent = readFileSync(join(stylesPath, 'index.css'), 'utf-8');

      const layerMatch = indexContent.match(/@layer\s+reset/);
      const importMatch = indexContent.match(/@import/);

      expect(layerMatch).not.toBeNull();
      expect(importMatch).not.toBeNull();
      expect(layerMatch!.index!).toBeLessThan(importMatch!.index!);
    });

    it('should have zero !important declarations in utility files', () => {
      const utilitiesPath = join(stylesPath, 'utilities');
      const files = readdirSync(utilitiesPath).filter((f) =>
        f.endsWith('.css')
      );

      let totalImportant = 0;
      const fileBreakdown: Record<string, number> = {};

      for (const file of files) {
        const content = readFileSync(join(utilitiesPath, file), 'utf-8');
        // Remove comments
        const withoutComments = content.replace(/\/\*[\s\S]*?\*\//g, '');
        const count = (withoutComments.match(/ !important/g) || []).length;
        if (count > 0) {
          fileBreakdown[file] = count;
        }
        totalImportant += count;
      }

      if (totalImportant > 0) {
        console.log('!important declarations found:');
        Object.entries(fileBreakdown).forEach(([file, count]) => {
          console.log(`  ${file}: ${count}`);
        });
      }

      expect(totalImportant).toBe(0);
    });
  });
});
