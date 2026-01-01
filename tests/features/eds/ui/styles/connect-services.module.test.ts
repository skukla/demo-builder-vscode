/**
 * Connect Services CSS Module Tests
 *
 * Validates the connect-services.module.css feature-scoped styles:
 * - File existence at correct location
 * - All required class names are defined
 * - Class names follow camelCase convention
 * - CSS properties match expected values
 *
 * Part of CSS Architecture Improvement - EDS Feature Migration
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('Connect Services CSS Module', () => {
  const modulePath = resolve(
    __dirname,
    '../../../../../src/features/eds/ui/styles/connect-services.module.css'
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

    describe('Grid Layout Classes', () => {
      it('defines servicesCardsGrid class', () => {
        expect(cssContent).toMatch(/\.servicesCardsGrid\s*\{/);
      });
    });

    describe('Card Classes', () => {
      it('defines serviceCard class', () => {
        expect(cssContent).toMatch(/\.serviceCard\s*\{/);
      });

      it('defines serviceCardHeader class', () => {
        expect(cssContent).toMatch(/\.serviceCardHeader\s*\{/);
      });

      it('defines serviceCardTitle class', () => {
        expect(cssContent).toMatch(/\.serviceCardTitle\s*\{/);
      });

      it('defines serviceCardDescription class', () => {
        expect(cssContent).toMatch(/\.serviceCardDescription\s*\{/);
      });

      it('defines serviceCardStatus class', () => {
        expect(cssContent).toMatch(/\.serviceCardStatus\s*\{/);
      });
    });

    describe('Icon Classes', () => {
      it('defines serviceIcon class', () => {
        expect(cssContent).toMatch(/\.serviceIcon\s*\{/);
      });

      it('defines githubIcon class', () => {
        expect(cssContent).toMatch(/\.githubIcon\s*\{/);
      });

      it('defines daliveIcon class', () => {
        expect(cssContent).toMatch(/\.daliveIcon\s*\{/);
      });
    });

    describe('Status Classes', () => {
      it('defines statusText class', () => {
        expect(cssContent).toMatch(/\.statusText\s*\{/);
      });

      it('defines statusTextError class', () => {
        expect(cssContent).toMatch(/\.statusTextError\s*\{/);
      });

      it('defines statusIconSuccess class', () => {
        expect(cssContent).toMatch(/\.statusIconSuccess\s*\{/);
      });

      it('defines statusIconError class', () => {
        expect(cssContent).toMatch(/\.statusIconError\s*\{/);
      });
    });

    describe('Action Classes', () => {
      it('defines serviceActionButton class', () => {
        expect(cssContent).toMatch(/\.serviceActionButton\s*\{/);
      });

      it('defines serviceActionLink class', () => {
        expect(cssContent).toMatch(/\.serviceActionLink\s*\{/);
      });
    });

    describe('Form Classes', () => {
      it('defines serviceInput class', () => {
        expect(cssContent).toMatch(/\.serviceInput\s*\{/);
      });

      it('defines daliveInputForm class', () => {
        expect(cssContent).toMatch(/\.daliveInputForm\s*\{/);
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

    it('servicesCardsGrid uses display: grid', () => {
      expect(cssContent).toMatch(
        /\.servicesCardsGrid\s*\{[^}]*display:\s*grid/
      );
    });

    it('servicesCardsGrid has two-column layout', () => {
      expect(cssContent).toMatch(
        /\.servicesCardsGrid\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/
      );
    });

    it('serviceCard has border-radius: 12px', () => {
      expect(cssContent).toMatch(
        /\.serviceCard\s*\{[^}]*border-radius:\s*12px/
      );
    });

    it('serviceCard has padding: 20px', () => {
      expect(cssContent).toMatch(
        /\.serviceCard\s*\{[^}]*padding:\s*20px/
      );
    });

    it('serviceCardHeader uses flexbox', () => {
      expect(cssContent).toMatch(
        /\.serviceCardHeader\s*\{[^}]*display:\s*flex/
      );
    });

    it('serviceIcon has 24px dimensions', () => {
      expect(cssContent).toMatch(
        /\.serviceIcon\s*\{[^}]*width:\s*24px/
      );
      expect(cssContent).toMatch(
        /\.serviceIcon\s*\{[^}]*height:\s*24px/
      );
    });

    it('serviceCardTitle has font-weight: 600', () => {
      expect(cssContent).toMatch(
        /\.serviceCardTitle\s*\{[^}]*font-weight:\s*600/
      );
    });

    it('serviceActionButton has border-radius: 6px', () => {
      expect(cssContent).toMatch(
        /\.serviceActionButton\s*\{[^}]*border-radius:\s*6px/
      );
    });

    it('serviceInput has width: 100%', () => {
      expect(cssContent).toMatch(
        /\.serviceInput\s*\{[^}]*width:\s*100%/
      );
    });

    it('daliveInputForm uses flex column direction', () => {
      expect(cssContent).toMatch(
        /\.daliveInputForm\s*\{[^}]*display:\s*flex/
      );
      expect(cssContent).toMatch(
        /\.daliveInputForm\s*\{[^}]*flex-direction:\s*column/
      );
    });
  });

  describe('Responsive Design', () => {
    let cssContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        cssContent = readFileSync(modulePath, 'utf-8');
      } else {
        cssContent = '';
      }
    });

    it('has media query for single column on small screens', () => {
      expect(cssContent).toMatch(/@media\s*\(max-width:\s*600px\)/);
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

      // Filter to only service-related classes (exclude media query content)
      const serviceClasses = classSelectors.filter(
        (cls) =>
          cls.toLowerCase().includes('service') ||
          cls.toLowerCase().includes('status') ||
          cls.toLowerCase().includes('dalive') ||
          cls.toLowerCase().includes('github')
      );

      // Verify none contain hyphens
      const hyphenatedClasses = serviceClasses.filter((cls) => cls.includes('-'));
      expect(hyphenatedClasses).toEqual([]);

      // Verify all use camelCase (start with lowercase)
      serviceClasses.forEach((cls) => {
        const className = cls.substring(1); // Remove leading dot
        expect(className[0]).toMatch(/[a-z]/);
      });
    });
  });

  describe('Global CSS Cleanup Verification', () => {
    const globalCssPath = resolve(
      __dirname,
      '../../../../../src/features/eds/ui/styles/connect-services.css'
    );

    it('global connect-services.css should be removed', () => {
      expect(existsSync(globalCssPath)).toBe(false);
    });
  });
});
