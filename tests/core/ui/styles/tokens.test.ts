/**
 * Design Token System Tests
 *
 * Validates that tokens.css contains all required CSS custom properties
 * for the unified theme system.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Design Token System', () => {
  let tokensCSS: string;

  beforeAll(() => {
    tokensCSS = readFileSync(
      resolve(__dirname, '../../../../src/core/ui/styles/tokens.css'),
      'utf-8'
    );
  });

  describe('Layer Declaration', () => {
    it('wraps tokens in @layer theme', () => {
      expect(tokensCSS).toContain('@layer theme');
    });
  });

  describe('Primitive Tokens', () => {
    describe('Gray Scale', () => {
      it('defines gray-50 (lightest)', () => {
        expect(tokensCSS).toContain('--db-color-gray-50:');
      });

      it('defines gray-900 (darkest)', () => {
        expect(tokensCSS).toContain('--db-color-gray-900:');
      });

      it('defines intermediate gray values', () => {
        expect(tokensCSS).toContain('--db-color-gray-100:');
        expect(tokensCSS).toContain('--db-color-gray-500:');
        expect(tokensCSS).toContain('--db-color-gray-700:');
        expect(tokensCSS).toContain('--db-color-gray-800:');
      });
    });

    describe('Status Colors', () => {
      it('defines green status primitives', () => {
        expect(tokensCSS).toContain('--db-color-green-100:');
        expect(tokensCSS).toContain('--db-color-green-500:');
      });

      it('defines red status primitives', () => {
        expect(tokensCSS).toContain('--db-color-red-100:');
        expect(tokensCSS).toContain('--db-color-red-500:');
      });

      it('defines amber status primitives', () => {
        expect(tokensCSS).toContain('--db-color-amber-100:');
        expect(tokensCSS).toContain('--db-color-amber-500:');
      });

      it('defines blue status primitives', () => {
        expect(tokensCSS).toContain('--db-color-blue-100:');
        expect(tokensCSS).toContain('--db-color-blue-500:');
      });
    });

    describe('Brand Colors (Tangerine)', () => {
      it('defines tangerine-500 with correct hex value', () => {
        expect(tokensCSS).toContain('--db-color-tangerine-500:');
        expect(tokensCSS).toContain('#f97316');
      });

      it('defines tangerine hover state (600)', () => {
        expect(tokensCSS).toContain('--db-color-tangerine-600:');
        expect(tokensCSS).toContain('#ea580c');
      });

      it('defines tangerine active state (700)', () => {
        expect(tokensCSS).toContain('--db-color-tangerine-700:');
        expect(tokensCSS).toContain('#c2410c');
      });
    });

    describe('Terminal Colors', () => {
      it('defines terminal background and foreground', () => {
        expect(tokensCSS).toContain('--db-color-terminal-bg:');
        expect(tokensCSS).toContain('--db-color-terminal-fg:');
      });

      it('defines terminal syntax colors', () => {
        expect(tokensCSS).toContain('--db-color-terminal-command:');
        expect(tokensCSS).toContain('--db-color-terminal-success:');
        expect(tokensCSS).toContain('--db-color-terminal-error:');
        expect(tokensCSS).toContain('--db-color-terminal-warning:');
      });
    });
  });

  describe('Semantic Tokens', () => {
    describe('Status Semantic Tokens', () => {
      it('defines success status token', () => {
        expect(tokensCSS).toContain('--db-status-success:');
        expect(tokensCSS).toContain('--db-status-success-bg:');
      });

      it('defines error status token', () => {
        expect(tokensCSS).toContain('--db-status-error:');
        expect(tokensCSS).toContain('--db-status-error-bg:');
      });

      it('defines warning status token', () => {
        expect(tokensCSS).toContain('--db-status-warning:');
        expect(tokensCSS).toContain('--db-status-warning-bg:');
      });

      it('defines info status token', () => {
        expect(tokensCSS).toContain('--db-status-info:');
        expect(tokensCSS).toContain('--db-status-info-bg:');
      });

      it('defines neutral status token', () => {
        expect(tokensCSS).toContain('--db-status-neutral:');
        expect(tokensCSS).toContain('--db-status-neutral-bg:');
      });
    });

    describe('Brand Semantic Tokens', () => {
      it('defines brand primary token', () => {
        expect(tokensCSS).toContain('--db-brand-primary:');
      });

      it('defines brand hover state', () => {
        expect(tokensCSS).toContain('--db-brand-primary-hover:');
      });

      it('defines brand active state', () => {
        expect(tokensCSS).toContain('--db-brand-primary-active:');
      });
    });

    describe('Surface Tokens', () => {
      it('defines surface background and foreground', () => {
        expect(tokensCSS).toContain('--db-surface-background:');
        expect(tokensCSS).toContain('--db-surface-foreground:');
      });
    });

    describe('Terminal Semantic Tokens', () => {
      it('defines terminal background token', () => {
        expect(tokensCSS).toContain('--db-terminal-background:');
      });

      it('defines terminal foreground token', () => {
        expect(tokensCSS).toContain('--db-terminal-foreground:');
      });
    });
  });

  describe('Component Tokens', () => {
    describe('StatusDot Component', () => {
      it('defines status dot tokens for all states', () => {
        expect(tokensCSS).toContain('--db-status-dot-success:');
        expect(tokensCSS).toContain('--db-status-dot-error:');
        expect(tokensCSS).toContain('--db-status-dot-warning:');
        expect(tokensCSS).toContain('--db-status-dot-info:');
        expect(tokensCSS).toContain('--db-status-dot-neutral:');
      });
    });

    describe('Badge Component', () => {
      it('defines badge background tokens', () => {
        expect(tokensCSS).toContain('--db-badge-success-bg:');
        expect(tokensCSS).toContain('--db-badge-error-bg:');
        expect(tokensCSS).toContain('--db-badge-warning-bg:');
        expect(tokensCSS).toContain('--db-badge-info-bg:');
        expect(tokensCSS).toContain('--db-badge-neutral-bg:');
      });

      it('defines badge text tokens', () => {
        expect(tokensCSS).toContain('--db-badge-success-text:');
        expect(tokensCSS).toContain('--db-badge-error-text:');
        expect(tokensCSS).toContain('--db-badge-warning-text:');
        expect(tokensCSS).toContain('--db-badge-info-text:');
        expect(tokensCSS).toContain('--db-badge-neutral-text:');
      });
    });

    describe('CTA Button Component', () => {
      it('defines CTA background tokens', () => {
        expect(tokensCSS).toContain('--db-cta-background:');
        expect(tokensCSS).toContain('--db-cta-background-hover:');
        expect(tokensCSS).toContain('--db-cta-background-active:');
      });

      it('defines CTA text token', () => {
        expect(tokensCSS).toContain('--db-cta-text:');
      });
    });

    describe('Code/NumberedInstructions Component', () => {
      it('defines code background and border tokens', () => {
        expect(tokensCSS).toContain('--db-code-background:');
        expect(tokensCSS).toContain('--db-code-border:');
      });
    });

    describe('LoadingOverlay Component', () => {
      it('defines loading overlay tokens', () => {
        expect(tokensCSS).toContain('--db-loading-overlay-bg:');
        expect(tokensCSS).toContain('--db-loading-text:');
      });
    });

    describe('Tip Component', () => {
      it('defines tip info tokens', () => {
        expect(tokensCSS).toContain('--db-tip-info-bg:');
        expect(tokensCSS).toContain('--db-tip-info-border:');
      });

      it('defines tip success tokens', () => {
        expect(tokensCSS).toContain('--db-tip-success-bg:');
        expect(tokensCSS).toContain('--db-tip-success-border:');
      });
    });
  });

  describe('Token Architecture', () => {
    it('uses --db- namespace prefix for all custom tokens', () => {
      // Ensure no non-namespaced custom properties
      const customProperties = tokensCSS.match(/--[a-z][a-z0-9-]*:/g) || [];
      const nonNamespaced = customProperties.filter(
        (prop) => !prop.startsWith('--db-')
      );
      expect(nonNamespaced).toEqual([]);
    });

    it('semantic tokens reference primitives using var()', () => {
      // Check that semantic tokens use var() to reference primitives
      expect(tokensCSS).toMatch(/--db-status-success:\s*var\(--db-color-/);
      expect(tokensCSS).toMatch(/--db-brand-primary:\s*var\(--db-color-/);
      expect(tokensCSS).toMatch(/--db-surface-background:\s*var\(--db-color-/);
    });

    it('component tokens reference semantic tokens using var()', () => {
      // Check that component tokens use var() to reference semantic tokens
      expect(tokensCSS).toMatch(/--db-status-dot-success:\s*var\(--db-status-/);
      expect(tokensCSS).toMatch(/--db-badge-success-bg:\s*var\(--db-status-/);
      expect(tokensCSS).toMatch(/--db-cta-background:\s*var\(--db-brand-/);
    });
  });
});
