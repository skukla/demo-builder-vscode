/**
 * Entry Point Update Tests
 *
 * Validates that index.css imports the new modular CSS structure
 * in the correct cascade order, and custom-spectrum.css is eliminated.
 *
 * Part of CSS Utility Modularization - Step 5: Update Entry Point
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

    it('should import utilities before spectrum', () => {
      const utilitiesIndex = indexContent.indexOf("@import './utilities/index.css'");
      const spectrumIndex = indexContent.indexOf("@import './spectrum/index.css'");
      expect(utilitiesIndex).toBeGreaterThan(-1);
      expect(spectrumIndex).toBeGreaterThan(-1);
      expect(utilitiesIndex).toBeLessThan(spectrumIndex);
    });

    it('should import spectrum before components', () => {
      const spectrumIndex = indexContent.indexOf("@import './spectrum/index.css'");
      const componentsIndex = indexContent.indexOf("@import './components/index.css'");
      expect(spectrumIndex).toBeGreaterThan(-1);
      expect(componentsIndex).toBeGreaterThan(-1);
      expect(spectrumIndex).toBeLessThan(componentsIndex);
    });
  });

  describe('Complete Imports', () => {
    it('should import utilities barrel', () => {
      expect(indexContent).toContain("@import './utilities/index.css'");
    });

    it('should import spectrum barrel', () => {
      expect(indexContent).toContain("@import './spectrum/index.css'");
    });

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

  describe('custom-spectrum.css Elimination', () => {
    it('should not import custom-spectrum.css', () => {
      expect(indexContent).not.toContain('custom-spectrum.css');
    });

    it('custom-spectrum.css should be deleted or under 100 lines', () => {
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
      expect(indexContent).toMatch(/@layer\s+reset,\s*theme,\s*overrides/);
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

    it('should maintain canonical keyframes (pulse, fadeIn)', () => {
      expect(indexContent).toContain('@keyframes pulse');
      expect(indexContent).toContain('@keyframes fadeIn');
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
