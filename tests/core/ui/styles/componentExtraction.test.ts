/**
 * Component Extraction Tests
 *
 * Validates that semantic component styles have been extracted from
 * custom-spectrum.css into categorized files under components/.
 *
 * Part of CSS Utility Modularization - Step 4: Extract Component Styles
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

describe('Component Extraction', () => {
  const stylesDir = resolve(__dirname, '../../../../src/core/ui/styles');
  const componentsDir = join(stylesDir, 'components');

  describe('Card Styles', () => {
    const cardsPath = join(componentsDir, 'cards.css');
    let cardsContent: string;

    beforeAll(() => {
      if (existsSync(cardsPath)) {
        cardsContent = readFileSync(cardsPath, 'utf-8');
      }
    });

    it('should contain card container styles', () => {
      expect(cardsContent).toMatch(/\.card-container\s*\{/);
    });

    it('should contain card hover effects', () => {
      expect(cardsContent).toMatch(/\.card-hover:hover\s*\{/);
    });

    it('should contain bordered container styles', () => {
      expect(cardsContent).toMatch(/\.bordered-container\s*\{/);
    });
  });

  describe('Timeline Styles', () => {
    const timelinePath = join(componentsDir, 'timeline.css');
    let timelineContent: string;

    beforeAll(() => {
      if (existsSync(timelinePath)) {
        timelineContent = readFileSync(timelinePath, 'utf-8');
      }
    });

    it('should contain timeline container styles', () => {
      expect(timelineContent).toMatch(/\.timeline-container\s*\{/);
    });

    it('should contain timeline step dot styles', () => {
      expect(timelineContent).toMatch(/\.timeline-step-dot\s*\{/);
      expect(timelineContent).toMatch(/\.timeline-step-dot-completed\s*\{/);
      expect(timelineContent).toMatch(/\.timeline-step-dot-current\s*\{/);
    });

    it('should contain timeline connector styles', () => {
      expect(timelineContent).toMatch(/\.timeline-connector\s*\{/);
      expect(timelineContent).toMatch(/\.timeline-connector-completed\s*\{/);
    });

    it('should contain timeline animation keyframes', () => {
      expect(timelineContent).toMatch(/@keyframes timeline-enter/);
      expect(timelineContent).toMatch(/@keyframes timeline-exit/);
    });
  });

  describe('Dashboard Styles', () => {
    const dashboardPath = join(componentsDir, 'dashboard.css');
    let dashboardContent: string;

    beforeAll(() => {
      if (existsSync(dashboardPath)) {
        dashboardContent = readFileSync(dashboardPath, 'utf-8');
      }
    });

    it('should contain dashboard status header styles', () => {
      expect(dashboardContent).toMatch(/\.dashboard-status-header\s*\{/);
    });

    it('should contain dashboard grid styles', () => {
      expect(dashboardContent).toMatch(/\.dashboard-grid-container\s*\{/);
      expect(dashboardContent).toMatch(/\.dashboard-grid\s*\{/);
    });

    it('should contain dashboard action button styles', () => {
      expect(dashboardContent).toMatch(/\.dashboard-action-button\s*\{/);
    });

    it('should contain dashboard button hover/focus states', () => {
      expect(dashboardContent).toMatch(/\.dashboard-action-button:hover/);
      expect(dashboardContent).toMatch(/\.dashboard-action-button:focus/);
    });
  });

  describe('Common Styles', () => {
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

  describe('File Size Constraints', () => {
    it('cards.css should be under 500 lines', () => {
      const content = readFileSync(join(componentsDir, 'cards.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(500);
    });

    it('timeline.css should be under 500 lines', () => {
      const content = readFileSync(join(componentsDir, 'timeline.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(500);
    });

    it('dashboard.css should be under 500 lines', () => {
      const content = readFileSync(join(componentsDir, 'dashboard.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(500);
    });

    it('common.css should be under 500 lines', () => {
      const content = readFileSync(join(componentsDir, 'common.css'), 'utf-8');
      expect(content.split('\n').length).toBeLessThanOrEqual(500);
    });
  });
});
