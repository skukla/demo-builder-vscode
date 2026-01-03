/**
 * Component Extraction Tests
 *
 * Validates that semantic component styles have been extracted from
 * custom-spectrum.css into categorized files.
 *
 * Part of CSS Utility Modularization - Step 4: Extract Component Styles
 *
 * Migration Notes:
 * - cards.css migrated to projects-dashboard.module.css
 * - dashboard.css migrated to dashboard.module.css
 * - timeline.css migrated to TimelineNav.module.css
 * - common.css remains as global styles (shared layout utilities)
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Component Extraction', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');
  const componentsDir = join(stylesDir, 'components');
  const coreUiDir = resolve(__dirname, '../../../../src/core/ui/components');
  const projectsDashboardDir = resolve(__dirname, '../../../../src/features/projects-dashboard/ui/styles');
  const dashboardDir = resolve(__dirname, '../../../../src/features/dashboard/ui/styles');

  describe('Common Styles (Global)', () => {
    const commonPath = join(componentsDir, 'common.css');
    let commonContent: string;

    beforeAll(() => {
      if (existsSync(commonPath)) {
        commonContent = readFileSync(commonPath, 'utf-8');
      }
    });

    it('should contain container styles', () => {
      expect(commonContent).toMatch(/\.container-wizard\s*\{/);
      expect(commonContent).toMatch(/\.container-dashboard\s*\{/);
    });

    it('should contain loading overlay styles', () => {
      expect(commonContent).toMatch(/\.loading-overlay-container\s*\{/);
      expect(commonContent).toMatch(/\.loading-overlay-spinner\s*\{/);
    });

    it('should contain empty state styles', () => {
      expect(commonContent).toMatch(/\.empty-state-container\s*\{/);
    });

    it('should contain status indicator styles', () => {
      expect(commonContent).toMatch(/\.status-icon-sm\s*\{/);
      expect(commonContent).toMatch(/\.status-row\s*\{/);
    });

    it('should contain wizard layout styles', () => {
      expect(commonContent).toMatch(/\.wizard-wrapper\s*\{/);
    });
  });

  describe('CSS Modules Migration', () => {
    describe('Projects Dashboard CSS Module', () => {
      const modulePath = join(projectsDashboardDir, 'projects-dashboard.module.css');

      it('should exist as a CSS Module', () => {
        expect(existsSync(modulePath)).toBe(true);
      });

      it('should contain project card styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.projectCard\s*\{/);
        expect(content).toMatch(/\.projectCardName\s*\{/);
        expect(content).toMatch(/\.projectCardStatus\s*\{/);
      });

      it('should contain project row styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.projectRow\s*\{/);
        expect(content).toMatch(/\.projectRowName\s*\{/);
      });

      it('should contain project button grid styles', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.projectButton\s*\{/);
        expect(content).toMatch(/\.projectButtonGrid\s*\{/);
      });
    });

    describe('Dashboard CSS Module', () => {
      const modulePath = join(dashboardDir, 'dashboard.module.css');

      it('should exist as a CSS Module', () => {
        expect(existsSync(modulePath)).toBe(true);
      });

      it('should contain status header styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.statusHeader\s*\{/);
        expect(content).toMatch(/\.statusContent\s*\{/);
      });

      it('should contain grid styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.gridContainer\s*\{/);
        expect(content).toMatch(/\.grid\s*\{/);
      });

      it('should contain action button styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.actionButton\s*\{/);
        expect(content).toMatch(/\.iconLabel\s*\{/);
      });
    });

    describe('TimelineNav CSS Module', () => {
      const modulePath = join(coreUiDir, 'TimelineNav.module.css');

      it('should exist as a CSS Module', () => {
        expect(existsSync(modulePath)).toBe(true);
      });

      it('should contain container styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.container\s*\{/);
        expect(content).toMatch(/\.containerSidebar\s*\{/);
      });

      it('should contain step dot styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.stepDot\s*\{/);
        expect(content).toMatch(/\.stepDotCompleted\s*\{/);
        expect(content).toMatch(/\.stepDotCurrent\s*\{/);
      });

      it('should contain connector styles (camelCase)', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/\.connector\s*\{/);
        expect(content).toMatch(/\.connectorCompleted\s*\{/);
      });

      it('should contain animation keyframes', () => {
        const content = readFileSync(modulePath, 'utf-8');
        expect(content).toMatch(/@keyframes timelineEnter/);
        expect(content).toMatch(/@keyframes timelineExit/);
      });
    });
  });

  describe('Legacy Global CSS Removed', () => {
    it('cards.css should NOT exist (migrated to CSS Module)', () => {
      const cardsPath = join(componentsDir, 'cards.css');
      expect(existsSync(cardsPath)).toBe(false);
    });

    it('dashboard.css should NOT exist (migrated to CSS Module)', () => {
      const dashboardPath = join(componentsDir, 'dashboard.css');
      expect(existsSync(dashboardPath)).toBe(false);
    });

    it('timeline.css should NOT exist (migrated to CSS Module)', () => {
      const timelinePath = join(componentsDir, 'timeline.css');
      expect(existsSync(timelinePath)).toBe(false);
    });
  });

  describe('File Size Constraints', () => {
    it('common.css should be under 500 lines', () => {
      const content = readFileSync(join(componentsDir, 'common.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(500);
    });

    it('each CSS Module should be under 300 lines', () => {
      const modules = [
        join(projectsDashboardDir, 'projects-dashboard.module.css'),
        join(dashboardDir, 'dashboard.module.css'),
        join(coreUiDir, 'TimelineNav.module.css'),
      ];

      for (const modulePath of modules) {
        if (existsSync(modulePath)) {
          const content = readFileSync(modulePath, 'utf-8');
          const lineCount = content.split('\n').length;
          expect(lineCount).toBeLessThanOrEqual(300);
        }
      }
    });
  });
});
