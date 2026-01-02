/**
 * Spectrum Extraction Tests
 *
 * Validates that Spectrum component overrides have been extracted from
 * custom-spectrum.css into categorized files under spectrum/.
 *
 * Part of CSS Utility Modularization - Step 3: Extract Spectrum Overrides
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Spectrum Extraction', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');
  const spectrumDir = join(stylesDir, 'spectrum');

  describe('Button Overrides', () => {
    const buttonsPath = join(spectrumDir, 'buttons.css');
    let buttonsContent: string;

    beforeAll(() => {
      if (existsSync(buttonsPath)) {
        buttonsContent = readFileSync(buttonsPath, 'utf-8');
      }
    });

    it('should contain Spectrum Button cursor overrides', () => {
      expect(buttonsContent).toMatch(/\.spectrum-Button:not\(:disabled\)/);
      expect(buttonsContent).toMatch(/cursor:\s*pointer/);
    });

    it('should contain disabled button styles', () => {
      expect(buttonsContent).toMatch(/\.spectrum-Button:disabled/);
      expect(buttonsContent).toMatch(/cursor:\s*not-allowed/);
    });

    it('should contain button size variations', () => {
      expect(buttonsContent).toMatch(/\.btn-compact\s*\{/);
      expect(buttonsContent).toMatch(/\.btn-standard\s*\{/);
      expect(buttonsContent).toMatch(/\.btn-large\s*\{/);
    });

    it('should contain CTA button overrides', () => {
      expect(buttonsContent).toMatch(/\.spectrum-Button--cta/);
      expect(buttonsContent).toMatch(/--db-cta-background/);
    });

    it('should contain CTA hover/focus states', () => {
      expect(buttonsContent).toMatch(/\.spectrum-Button--cta:hover/);
      expect(buttonsContent).toMatch(/--db-cta-background-hover/);
    });

    it('should contain CTA active state', () => {
      expect(buttonsContent).toMatch(/\.spectrum-Button--cta:active/);
      expect(buttonsContent).toMatch(/--db-cta-background-active/);
    });
  });

  describe('Component Overrides', () => {
    const componentsPath = join(spectrumDir, 'components.css');
    let componentsContent: string;

    beforeAll(() => {
      if (existsSync(componentsPath)) {
        componentsContent = readFileSync(componentsPath, 'utf-8');
      }
    });

    it('should contain progress bar customizations', () => {
      expect(componentsContent).toMatch(/\.progress-bar-small-label/);
      expect(componentsContent).toMatch(/\.progress-bar-full-width/);
    });

    it('should contain progress bar animations', () => {
      expect(componentsContent).toMatch(/\[class\*="spectrum-ProgressBar"\]/);
      expect(componentsContent).toMatch(/@keyframes fadeInUp/);
    });

    it('should contain progress bar fill transitions', () => {
      expect(componentsContent).toMatch(/\[class\*="spectrum-ProgressBar-fill"\]/);
      expect(componentsContent).toMatch(/transition:\s*width/);
    });
  });

  describe('File Size Constraints', () => {
    it('buttons.css should be under 300 lines', () => {
      const content = readFileSync(join(spectrumDir, 'buttons.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });

    it('components.css should be under 300 lines', () => {
      const content = readFileSync(join(spectrumDir, 'components.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(300);
    });
  });
});
