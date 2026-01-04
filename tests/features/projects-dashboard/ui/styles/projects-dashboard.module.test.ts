/**
 * Projects Dashboard CSS Module Tests
 *
 * Validates the migration of projects-dashboard CSS classes from
 * custom-spectrum.css to a feature-scoped CSS Module.
 *
 * Part of CSS Architecture Improvement - Step 7: Projects Dashboard Migration
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

describe('Projects Dashboard CSS Module', () => {
  const projectRoot = resolve(__dirname, '../../../../..');
  const moduleDir = resolve(
    projectRoot,
    'src/features/projects-dashboard/ui/styles'
  );
  const modulePath = resolve(moduleDir, 'projects-dashboard.module.css');
  const globalCssPath = resolve(
    projectRoot,
    'src/core/ui/styles/custom-spectrum.css'
  );
  const projectsGridPath = resolve(
    projectRoot,
    'src/features/projects-dashboard/ui/components/ProjectsGrid.tsx'
  );
  const projectsDashboardPath = resolve(
    projectRoot,
    'src/features/projects-dashboard/ui/ProjectsDashboard.tsx'
  );

  describe('CSS Module File Structure', () => {
    it('should have styles directory at correct path', () => {
      expect(existsSync(moduleDir)).toBe(true);
    });

    it('should have projects-dashboard.module.css file', () => {
      expect(existsSync(modulePath)).toBe(true);
    });
  });

  describe('CSS Module Class Definitions', () => {
    let moduleContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        moduleContent = readFileSync(modulePath, 'utf-8');
      } else {
        moduleContent = '';
      }
    });

    it('should define projectsStickyHeader class', () => {
      expect(moduleContent).toContain('.projectsStickyHeader');
    });

    it('should define projectsGrid class', () => {
      expect(moduleContent).toContain('.projectsGrid');
    });

    it('should have sticky positioning for header', () => {
      expect(moduleContent).toMatch(/position:\s*sticky/i);
    });

    it('should have grid display for grid class', () => {
      expect(moduleContent).toMatch(/display:\s*grid/i);
    });

    it('should have proper grid template columns', () => {
      expect(moduleContent).toMatch(/grid-template-columns:/i);
      expect(moduleContent).toMatch(/auto-fill/i);
      // Uses 260px minmax for consistent card sizing
      expect(moduleContent).toMatch(/minmax\s*\(\s*260px/i);
    });
  });

  describe('Component Integration', () => {
    let projectsGridContent: string;
    let projectsDashboardContent: string;

    beforeAll(() => {
      if (existsSync(projectsGridPath)) {
        projectsGridContent = readFileSync(projectsGridPath, 'utf-8');
      } else {
        projectsGridContent = '';
      }
      if (existsSync(projectsDashboardPath)) {
        projectsDashboardContent = readFileSync(projectsDashboardPath, 'utf-8');
      } else {
        projectsDashboardContent = '';
      }
    });

    it('should import CSS Module in ProjectsGrid.tsx', () => {
      // Uses stylesImport for defensive fallback pattern
      expect(projectsGridContent).toMatch(
        /import\s+stylesImport\s+from\s+['"].*projects-dashboard\.module\.css['"]/
      );
    });

    it('should use styles.projectsGrid in ProjectsGrid.tsx', () => {
      expect(projectsGridContent).toContain('styles.projectsGrid');
    });

    it('should import CSS Module in ProjectsDashboard.tsx', () => {
      // Uses stylesImport for defensive fallback pattern
      expect(projectsDashboardContent).toMatch(
        /import\s+stylesImport\s+from\s+['"].*projects-dashboard\.module\.css['"]/
      );
    });

    it('should use styles.projectsStickyHeader in ProjectsDashboard.tsx', () => {
      expect(projectsDashboardContent).toContain('styles.projectsStickyHeader');
    });

    it('should NOT use global projects-grid class in ProjectsGrid.tsx', () => {
      // Should not have className="projects-grid" as a string literal
      expect(projectsGridContent).not.toMatch(/className\s*=\s*["']projects-grid["']/);
    });

    it('should NOT use global projects-sticky-header class in ProjectsDashboard.tsx', () => {
      // Should not have className="projects-sticky-header" as a string literal
      expect(projectsDashboardContent).not.toMatch(
        /className\s*=\s*["']projects-sticky-header["']/
      );
    });
  });

  describe('Global CSS Cleanup', () => {
    let globalCssContent: string;

    beforeAll(() => {
      globalCssContent = readFileSync(globalCssPath, 'utf-8');
    });

    it('should NOT contain .projects-sticky-header class definition', () => {
      // The class should be removed from global CSS
      expect(globalCssContent).not.toMatch(/\.projects-sticky-header\s*\{/);
    });

    it('should NOT contain .projects-grid class definition', () => {
      // The class should be removed from global CSS
      expect(globalCssContent).not.toMatch(/\.projects-grid\s*\{/);
    });

    it('should NOT contain Projects Dashboard section header', () => {
      // The section comment should also be removed
      expect(globalCssContent).not.toContain('Projects Dashboard Specific');
    });
  });

  describe('CSS Module Content Completeness', () => {
    let moduleContent: string;

    beforeAll(() => {
      if (existsSync(modulePath)) {
        moduleContent = readFileSync(modulePath, 'utf-8');
      } else {
        moduleContent = '';
      }
    });

    it('should define core layout classes', () => {
      // Module has grown to include all project card/row styles
      // Verify key layout classes exist
      expect(moduleContent).toContain('.projectsStickyHeader');
      expect(moduleContent).toContain('.projectsGrid');
      expect(moduleContent).toContain('.projectCard');
      expect(moduleContent).toContain('.projectRow');
    });

    it('should have header with proper z-index', () => {
      expect(moduleContent).toMatch(/z-index:\s*10/);
    });

    it('should have proper gap for grid', () => {
      // Grid uses 16px gap for consistent spacing
      expect(moduleContent).toMatch(/gap:\s*16px/);
    });
  });
});
