/**
 * Project Creation CSS Module Tests
 *
 * Validates that the project-creation.module.css file:
 * 1. Exists at the correct path
 * 2. Contains all required class definitions
 * 3. Uses camelCase naming convention
 * 4. Global CSS no longer contains these classes (migration complete)
 *
 * Part of CSS Architecture Improvement - Step 6: Project Creation Feature Migration
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('Project Creation CSS Module', () => {
  const modulePath = resolve(
    __dirname,
    '../../../../../src/features/project-creation/ui/styles/project-creation.module.css'
  );
  const globalCssPath = resolve(
    __dirname,
    '../../../../../src/core/ui/styles/custom-spectrum.css'
  );

  describe('Module Existence', () => {
    it('should exist at src/features/project-creation/ui/styles/project-creation.module.css', () => {
      expect(existsSync(modulePath)).toBe(true);
    });
  });

  describe('Selector Grid Classes', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should define selectorGrid class', () => {
      expect(moduleContent).toMatch(/\.selectorGrid\s*\{/);
    });

    it('should define selectorCard class', () => {
      expect(moduleContent).toMatch(/\.selectorCard\s*\{/);
    });

    it('should define selectorCardName class', () => {
      expect(moduleContent).toMatch(/\.selectorCardName\s*\{/);
    });

    it('should define selectorCardDescription class', () => {
      expect(moduleContent).toMatch(/\.selectorCardDescription\s*\{/);
    });
  });

  describe('Expandable Brand Card Classes', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should define expandableBrandGrid class', () => {
      expect(moduleContent).toMatch(/\.expandableBrandGrid\s*\{/);
    });

    it('should define expandableBrandCard class', () => {
      expect(moduleContent).toMatch(/\.expandableBrandCard\s*\{/);
    });

    it('should define brandCardHeader class', () => {
      expect(moduleContent).toMatch(/\.brandCardHeader\s*\{/);
    });

    it('should define brandCardTitleRow class', () => {
      expect(moduleContent).toMatch(/\.brandCardTitleRow\s*\{/);
    });

    it('should define brandCardName class', () => {
      expect(moduleContent).toMatch(/\.brandCardName\s*\{/);
    });

    it('should define brandCardCheck class', () => {
      expect(moduleContent).toMatch(/\.brandCardCheck\s*\{/);
    });

    it('should define brandCardDescription class', () => {
      expect(moduleContent).toMatch(/\.brandCardDescription\s*\{/);
    });

    it('should define brandCardSelection class', () => {
      expect(moduleContent).toMatch(/\.brandCardSelection\s*\{/);
    });

    it('should define brandCardSelectionLabel class', () => {
      expect(moduleContent).toMatch(/\.brandCardSelectionLabel\s*\{/);
    });

    it('should define brandCardSelectionValue class', () => {
      expect(moduleContent).toMatch(/\.brandCardSelectionValue\s*\{/);
    });
  });

  describe('Architecture Modal Classes', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should define architectureModalOptions class', () => {
      expect(moduleContent).toMatch(/\.architectureModalOptions\s*\{/);
    });

    it('should define architectureModalOption class', () => {
      expect(moduleContent).toMatch(/\.architectureModalOption\s*\{/);
    });

    it('should define architectureRadio class', () => {
      expect(moduleContent).toMatch(/\.architectureRadio\s*\{/);
    });

    it('should define architectureRadioDot class', () => {
      expect(moduleContent).toMatch(/\.architectureRadioDot\s*\{/);
    });

    it('should define architectureContent class', () => {
      expect(moduleContent).toMatch(/\.architectureContent\s*\{/);
    });

    it('should define architectureName class', () => {
      expect(moduleContent).toMatch(/\.architectureName\s*\{/);
    });

    it('should define architectureDescription class', () => {
      expect(moduleContent).toMatch(/\.architectureDescription\s*\{/);
    });
  });

  describe('Addon Classes', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should define architectureAddons class', () => {
      expect(moduleContent).toMatch(/\.architectureAddons\s*\{/);
    });

    it('should define addonLabel class', () => {
      expect(moduleContent).toMatch(/\.addonLabel\s*\{/);
    });

    it('should define addonName class', () => {
      expect(moduleContent).toMatch(/\.addonName\s*\{/);
    });

    it('should define addonDescription class', () => {
      expect(moduleContent).toMatch(/\.addonDescription\s*\{/);
    });
  });

  describe('State Modifier Classes', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should define selected state class', () => {
      expect(moduleContent).toMatch(/\.selected\s*\{/);
    });

    it('should define expanded state class', () => {
      expect(moduleContent).toMatch(/\.expanded\s*\{/);
    });

    it('should define dimmed state class', () => {
      expect(moduleContent).toMatch(/\.dimmed\s*\{/);
    });
  });

  describe('CamelCase Convention', () => {
    let moduleContent: string;

    beforeAll(() => {
      moduleContent = readFileSync(modulePath, 'utf-8');
    });

    it('should not contain kebab-case class names (selector-grid)', () => {
      expect(moduleContent).not.toMatch(/\.selector-grid\s*\{/);
    });

    it('should not contain kebab-case class names (expandable-brand-card)', () => {
      expect(moduleContent).not.toMatch(/\.expandable-brand-card\s*\{/);
    });

    it('should not contain kebab-case class names (brand-card-header)', () => {
      expect(moduleContent).not.toMatch(/\.brand-card-header\s*\{/);
    });

    it('should not contain kebab-case class names (architecture-modal-options)', () => {
      expect(moduleContent).not.toMatch(/\.architecture-modal-options\s*\{/);
    });
  });

  describe('Global CSS Migration', () => {
    let globalContent: string;

    beforeAll(() => {
      globalContent = readFileSync(globalCssPath, 'utf-8');
    });

    it('should NOT contain selector-grid in global CSS', () => {
      expect(globalContent).not.toMatch(/\.selector-grid\s*\{/);
    });

    it('should NOT contain selector-card in global CSS', () => {
      expect(globalContent).not.toMatch(/\.selector-card\s*\{/);
    });

    it('should NOT contain expandable-brand-grid in global CSS', () => {
      expect(globalContent).not.toMatch(/\.expandable-brand-grid\s*\{/);
    });

    it('should NOT contain expandable-brand-card in global CSS', () => {
      expect(globalContent).not.toMatch(/\.expandable-brand-card\s*\{/);
    });

    it('should NOT contain brand-card-header in global CSS', () => {
      expect(globalContent).not.toMatch(/\.brand-card-header\s*\{/);
    });

    it('should NOT contain architecture-modal-options in global CSS', () => {
      expect(globalContent).not.toMatch(/\.architecture-modal-options\s*\{/);
    });

    it('should NOT contain architecture-addons in global CSS', () => {
      expect(globalContent).not.toMatch(/\.architecture-addons\s*\{/);
    });
  });
});
