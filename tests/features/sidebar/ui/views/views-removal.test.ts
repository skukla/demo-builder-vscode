/**
 * Tests verifying that unused sidebar view components have been removed.
 *
 * Step 13 of Sidebar UX Simplification: Delete unused view components.
 *
 * These tests verify:
 * 1. ProjectsListView.tsx no longer exists
 * 2. ProjectView.tsx no longer exists
 * 3. WelcomeView.tsx no longer exists
 * 4. index.ts no longer exports these components
 * 5. Sidebar.tsx no longer imports these components
 * 6. TypeScript compilation succeeds
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Sidebar View Components Removal', () => {
    const viewsDir = path.resolve(
        __dirname,
        '../../../../../src/features/sidebar/ui/views'
    );
    const sidebarPath = path.resolve(
        __dirname,
        '../../../../../src/features/sidebar/ui/Sidebar.tsx'
    );

    describe('File removal verification', () => {
        it('should not have ProjectsListView.tsx file', () => {
            const filePath = path.join(viewsDir, 'ProjectsListView.tsx');
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it('should not have ProjectView.tsx file', () => {
            const filePath = path.join(viewsDir, 'ProjectView.tsx');
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it('should not have WelcomeView.tsx file', () => {
            const filePath = path.join(viewsDir, 'WelcomeView.tsx');
            expect(fs.existsSync(filePath)).toBe(false);
        });
    });

    /**
     * `describe('Export removal verification')` was DELETED here on 2026-08-31
     * (PL-31). Its six cases read `views/index.ts` and asserted it did not
     * re-export three removed components. That index no longer exists — the
     * barrel was retired — which is a strictly STRONGER guarantee than the one
     * these cases made: there is no re-export file for a deleted component to
     * reappear in, and the reExportIndex ledger fails the build if one is added.
     *
     * The file-existence and import checks above and below still earn their keep:
     * they guard against the components themselves coming back.
     */

    describe('Import removal verification', () => {
        it('should not import ProjectsListView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/import\s+.*ProjectsListView/);
        });

        it('should not import ProjectView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/import\s+.*ProjectView/);
        });

        it('should not import WelcomeView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/import\s+.*WelcomeView/);
        });
    });

    describe('Render logic removal verification', () => {
        it('should not render ProjectsListView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/<ProjectsListView/);
        });

        it('should not render ProjectView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/<ProjectView/);
        });

        it('should not render WelcomeView in Sidebar.tsx', () => {
            const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
            expect(sidebarContent).not.toMatch(/<WelcomeView/);
        });
    });

    describe('the views directory still exists', () => {
        /**
         * The `index.ts` case that sat here REQUIRED the barrel to exist. It was
         * deleted on 2026-08-31 with the barrel (PL-31) — a module is imported by
         * the path that declares it, so a re-export index in this directory is now
         * a build failure rather than a requirement.
         */
        it('should have views directory', () => {
            expect(fs.existsSync(viewsDir)).toBe(true);
        });
    });
});
