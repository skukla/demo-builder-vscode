/**
 * CSS Reset Tests
 *
 * Validates that reset.css provides proper style baseline
 * without breaking Adobe Spectrum components.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('CSS Reset', () => {
  let resetCSS: string;

  beforeAll(() => {
    resetCSS = readFileSync(
      resolve(__dirname, '../../../../src/core/ui/styles/reset.css'),
      'utf-8'
    );
  });

  describe('Layer Declaration', () => {
    it('uses @layer reset wrapper', () => {
      expect(resetCSS).toContain('@layer reset');
    });
  });

  describe('Box Model Reset', () => {
    it('includes box-sizing border-box', () => {
      expect(resetCSS).toContain('box-sizing: border-box');
    });
  });

  describe('Safety Constraints', () => {
    it('does NOT use all:initial (too aggressive for Spectrum)', () => {
      expect(resetCSS).not.toMatch(/all\s*:\s*initial/);
    });

    it('does NOT use all:unset (too aggressive for Spectrum)', () => {
      expect(resetCSS).not.toMatch(/all\s*:\s*unset/);
    });
  });

  describe('Element Resets', () => {
    it('resets margin on common elements', () => {
      expect(resetCSS).toContain('margin: 0');
    });

    it('resets padding on common elements', () => {
      expect(resetCSS).toContain('padding: 0');
    });

    it('removes list styles', () => {
      expect(resetCSS).toContain('list-style: none');
    });
  });

  describe('Accessibility Features', () => {
    it('includes reduced motion media query', () => {
      expect(resetCSS).toContain('prefers-reduced-motion');
    });

    it('prevents text size inflation', () => {
      expect(resetCSS).toContain('text-size-adjust');
    });
  });

  describe('Form Control Inheritance', () => {
    it('inherits fonts for form controls', () => {
      expect(resetCSS).toContain('font: inherit');
    });
  });
});
