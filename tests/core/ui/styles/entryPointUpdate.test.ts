/**
 * Entry Point Update Tests
 *
 * Validates that index.css imports the new modular CSS structure
 * in the correct cascade order.
 *
 * Part of CSS Utility Modularization - Step 5: Update Entry Point
 * Updated after React Aria migration (spectrum layer removed)
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Entry Point Update', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');
  const indexPath = join(stylesDir, 'index.css');
  let indexContent: string;

  beforeAll(() => {
    indexContent = readFileSync(indexPath, 'utf-8');
  });

  describe('Import Order', () => {
    it('should import reset.css first after layer declaration', () => {
      const layerIndex = indexContent.indexOf('@layer');
      const resetIndex = indexContent.indexOf("@import './reset.css'");
      expect(resetIndex).toBeGreaterThan(layerIndex);
      // Reset should come before tokens
      const tokensIndex = indexContent.indexOf("@import './tokens.css'");
      expect(resetIndex).toBeLessThan(tokensIndex);
    });

    it('should import tokens.css after reset', () => {
      const resetIndex = indexContent.indexOf("@import './reset.css'");
      const tokensIndex = indexContent.indexOf("@import './tokens.css'");
      expect(tokensIndex).toBeGreaterThan(resetIndex);
    });

    it('should import utilities before components', () => {
      const utilitiesIndex = indexContent.indexOf("@import './utilities/index.css'");
      const componentsIndex = indexContent.indexOf("@import './components/index.css'");
      expect(utilitiesIndex).toBeGreaterThan(-1);
      expect(componentsIndex).toBeGreaterThan(-1);
      expect(utilitiesIndex).toBeLessThan(componentsIndex);
    });
  });

  describe('Complete Imports', () => {
    it('should import utilities barrel', () => {
      expect(indexContent).toContain("@import './utilities/index.css'");
    });

    // Note: spectrum barrel import removed after React Aria migration

    it('should import components barrel', () => {
      expect(indexContent).toContain("@import './components/index.css'");
    });

    it('should import vscode-theme.css', () => {
      expect(indexContent).toContain("@import './vscode-theme.css'");
    });

    it('should import wizard.css', () => {
      expect(indexContent).toContain("@import './wizard.css'");
    });
  });

  describe('custom-spectrum.css Legacy Support', () => {
    it('should not import custom-spectrum.css in index.css', () => {
      expect(indexContent).not.toContain('custom-spectrum.css');
    });

    it('custom-spectrum.css should be a minimal stub if it exists', () => {
      const customSpectrumPath = join(stylesDir, 'custom-spectrum.css');
      if (existsSync(customSpectrumPath)) {
        const content = readFileSync(customSpectrumPath, 'utf-8');
        const lineCount = content.split('\n').length;
        expect(lineCount).toBeLessThanOrEqual(100);
      }
      // If file doesn't exist, that's also valid (deleted)
    });
  });

  describe('Layer Declaration', () => {
    it('should maintain @layer order declaration', () => {
      // Updated for 4-layer architecture after React Aria migration
      expect(indexContent).toMatch(/@layer\s+reset,\s*vscode-theme,\s*components,\s*utilities/);
    });

    it('should have layer declaration at the top', () => {
      const layerMatch = indexContent.match(/@layer/);
      expect(layerMatch).not.toBeNull();
      // Should be near the start (within first 500 chars, accounting for comments)
      expect(layerMatch!.index).toBeLessThan(500);
    });
  });

  describe('Content Integrity', () => {
    it('should maintain theme layer with body/html styles', () => {
      expect(indexContent).toContain('@layer theme');
      expect(indexContent).toMatch(/body,?\s*html\s*\{/);
    });

    it('should maintain #root styles', () => {
      expect(indexContent).toMatch(/#root\s*\{/);
    });

    it('should maintain scrollbar styles', () => {
      expect(indexContent).toContain('::-webkit-scrollbar');
    });

    it('should maintain terminal-output styles', () => {
      expect(indexContent).toContain('.terminal-output');
    });

    it('should maintain wizard-step animation styles', () => {
      expect(indexContent).toContain('.wizard-step-enter');
      expect(indexContent).toContain('.wizard-step-exit');
    });

    it('should maintain status-indicator styles', () => {
      expect(indexContent).toContain('.status-indicator');
    });

    it('should reference centralized keyframes (pulse, fadeIn)', () => {
      // Keyframes are now centralized in utilities/animations.css
      // index.css still has the .pulse utility class that uses the keyframe
      expect(indexContent).toContain('.pulse');
      expect(indexContent).toContain('animation: pulse');
    });

    it('should maintain code-block styles', () => {
      expect(indexContent).toContain('.code-block');
    });
  });

  describe('File Size', () => {
    it('index.css should be under 300 lines', () => {
      const lineCount = indexContent.split('\n').length;
      expect(lineCount).toBeLessThanOrEqual(300);
    });
  });
});
