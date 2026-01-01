/**
 * Prerequisites CSS Module Tests
 *
 * Validates the prerequisites.module.css feature-scoped styles:
 * - File existence at correct location
 * - All required class names are defined
 * - Class names follow camelCase convention
 * - CSS properties match expected values
 *
 * Part of CSS Architecture Improvement - Step 5: Prerequisites Feature Migration
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('Prerequisites CSS Module', () => {
  const modulePath = resolve(
    __dirname,
    '../../../../../src/features/prerequisites/ui/styles/prerequisites.module.css'
  );

  describe('File Structure', () => {
    it('should exist at the correct feature-scoped path', () => {
      expect(existsSync(modulePath)).toBe(true);
    });
  });

  describe('Class Name Definitions', () => {
    let cssContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        cssContent = readFileSync(modulePath, 'utf-8');
      } else {
        cssContent = '';
      }
    });

    describe('Container Classes', () => {
      it('defines prerequisitesContainer class', () => {
        expect(cssContent).toMatch(/\.prerequisitesContainer\s*\{/);
      });

      it('defines prerequisiteItem class', () => {
        expect(cssContent).toMatch(/\.prerequisiteItem\s*\{/);
      });

      it('defines prerequisiteItemGrid class', () => {
        expect(cssContent).toMatch(/\.prerequisiteItemGrid\s*\{/);
      });

      it('defines prerequisiteItemSpacing class', () => {
        expect(cssContent).toMatch(/\.prerequisiteItemSpacing\s*\{/);
      });
    });

    describe('Layout Classes', () => {
      it('defines prerequisiteIcon class', () => {
        expect(cssContent).toMatch(/\.prerequisiteIcon\s*\{/);
      });

      it('defines prerequisiteHeader class', () => {
        expect(cssContent).toMatch(/\.prerequisiteHeader\s*\{/);
      });

      it('defines prerequisiteHeaderInner class', () => {
        expect(cssContent).toMatch(/\.prerequisiteHeaderInner\s*\{/);
      });

      it('defines prerequisiteExpandable class', () => {
        expect(cssContent).toMatch(/\.prerequisiteExpandable\s*\{/);
      });

      it('defines prerequisiteContent class', () => {
        expect(cssContent).toMatch(/\.prerequisiteContent\s*\{/);
      });
    });

    describe('Typography Classes', () => {
      it('defines prerequisiteTitle class', () => {
        expect(cssContent).toMatch(/\.prerequisiteTitle\s*\{/);
      });

      it('defines prerequisiteDescription class', () => {
        expect(cssContent).toMatch(/\.prerequisiteDescription\s*\{/);
      });
    });

    describe('Message Classes', () => {
      it('defines prerequisiteMessage class', () => {
        expect(cssContent).toMatch(/\.prerequisiteMessage\s*\{/);
      });

      it('defines prerequisiteMessageError class', () => {
        expect(cssContent).toMatch(/\.prerequisiteMessageError\s*\{/);
      });

      it('defines prerequisiteMessageWarning class', () => {
        expect(cssContent).toMatch(/\.prerequisiteMessageWarning\s*\{/);
      });

      it('defines prerequisiteMessageDefault class', () => {
        expect(cssContent).toMatch(/\.prerequisiteMessageDefault\s*\{/);
      });
    });

    describe('Plugin Classes', () => {
      it('defines prerequisitePluginItem class', () => {
        expect(cssContent).toMatch(/\.prerequisitePluginItem\s*\{/);
      });

      it('defines prerequisiteList class', () => {
        expect(cssContent).toMatch(/\.prerequisiteList\s*\{/);
      });
    });
  });

  describe('CSS Property Validation', () => {
    let cssContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        cssContent = readFileSync(modulePath, 'utf-8');
      } else {
        cssContent = '';
      }
    });

    it('prerequisitesContainer has max-height: 360px', () => {
      expect(cssContent).toMatch(
        /\.prerequisitesContainer\s*\{[^}]*max-height:\s*360px/
      );
    });

    it('prerequisitesContainer has overflow-y: auto', () => {
      expect(cssContent).toMatch(
        /\.prerequisitesContainer\s*\{[^}]*overflow-y:\s*auto/
      );
    });

    it('prerequisiteItemGrid uses display: grid', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteItemGrid\s*\{[^}]*display:\s*grid/
      );
    });

    it('prerequisiteItemGrid has correct grid-template-columns', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteItemGrid\s*\{[^}]*grid-template-columns:\s*20px\s+1fr/
      );
    });

    it('prerequisiteIcon spans 2 rows in grid', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteIcon\s*\{[^}]*grid-row:\s*span\s*2/
      );
    });

    it('prerequisiteHeaderInner uses flexbox with space-between', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteHeaderInner\s*\{[^}]*display:\s*flex/
      );
      expect(cssContent).toMatch(
        /\.prerequisiteHeaderInner\s*\{[^}]*justify-content:\s*space-between/
      );
    });

    it('prerequisiteTitle has font-weight: 600', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteTitle\s*\{[^}]*font-weight:\s*600/
      );
    });

    it('prerequisiteDescription has font-size: 12px', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteDescription\s*\{[^}]*font-size:\s*12px/
      );
    });

    it('prerequisiteMessageError uses red color', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteMessageError\s*\{[^}]*color:\s*var\(--spectrum-global-color-red-600\)/
      );
    });

    it('prerequisiteItemSpacing has margin-bottom: 8px', () => {
      expect(cssContent).toMatch(
        /\.prerequisiteItemSpacing\s*\{[^}]*margin-bottom:\s*8px/
      );
    });
  });

  describe('Naming Convention', () => {
    let cssContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        cssContent = readFileSync(modulePath, 'utf-8');
      } else {
        cssContent = '';
      }
    });

    it('uses camelCase class names (no hyphens in class selectors)', () => {
      // Extract all class selectors from the CSS
      const classSelectors = cssContent.match(/\.[a-zA-Z][a-zA-Z0-9]*/g) || [];

      // Filter to only prerequisite-related classes
      const prereqClasses = classSelectors.filter((cls) =>
        cls.toLowerCase().includes('prerequisite')
      );

      // Verify none contain hyphens
      const hyphenatedClasses = prereqClasses.filter((cls) => cls.includes('-'));
      expect(hyphenatedClasses).toEqual([]);

      // Verify all use camelCase
      prereqClasses.forEach((cls) => {
        // Remove the leading dot
        const className = cls.substring(1);
        // Should start with lowercase and contain uppercase letters (camelCase)
        expect(className[0]).toMatch(/[a-z]/);
      });
    });
  });

  describe('Global CSS Cleanup Verification', () => {
    const wizardCssPath = resolve(
      __dirname,
      '../../../../../src/core/ui/styles/wizard.css'
    );
    const customSpectrumCssPath = resolve(
      __dirname,
      '../../../../../src/core/ui/styles/custom-spectrum.css'
    );

    it('wizard.css should not contain prerequisite classes', () => {
      if (!existsSync(wizardCssPath)) {
        return; // Skip if file doesn't exist
      }
      const wizardCss = readFileSync(wizardCssPath, 'utf-8');
      // These classes should be removed from wizard.css
      expect(wizardCss).not.toMatch(/\.prerequisites-container\s*\{/);
      expect(wizardCss).not.toMatch(/\.prerequisite-item-grid\s*\{/);
      expect(wizardCss).not.toMatch(/\.prerequisite-icon\s*\{/);
      expect(wizardCss).not.toMatch(/\.prerequisite-header\s*\{/);
      expect(wizardCss).not.toMatch(/\.prerequisite-header-inner\s*\{/);
      expect(wizardCss).not.toMatch(/\.prerequisite-expandable\s*\{/);
    });

    it('custom-spectrum.css should not contain prerequisite classes', () => {
      if (!existsSync(customSpectrumCssPath)) {
        return; // Skip if file doesn't exist
      }
      const customSpectrumCss = readFileSync(customSpectrumCssPath, 'utf-8');
      // These classes should be removed from custom-spectrum.css
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-container\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-item\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-item:not\(/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-list\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-content\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-title\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-description\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-message\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-message-error\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-message-warning\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-message-default\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-plugin-item\s*\{/);
      expect(customSpectrumCss).not.toMatch(/\.prerequisite-item-spacing\s*\{/);
    });
  });
});
