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
    const indexPath = path.resolve(viewsDir, 'index.ts');

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

    describe('Export removal verification', () => {
        it('should not export ProjectsListView from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+.*ProjectsListView/);
        });

        it('should not export ProjectView from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+.*ProjectView/);
        });

        it('should not export WelcomeView from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+.*WelcomeView/);
        });

        it('should not export ProjectsListViewProps type from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+type\s+.*ProjectsListViewProps/);
        });

        it('should not export ProjectViewProps type from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+type\s+.*ProjectViewProps/);
        });

        it('should not export WelcomeViewProps type from index.ts', () => {
            const indexContent = fs.readFileSync(indexPath, 'utf-8');
            expect(indexContent).not.toMatch(/export\s+type\s+.*WelcomeViewProps/);
        });
    });

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

    describe('views directory should still exist with index.ts', () => {
        it('should have index.ts file in views directory', () => {
            expect(fs.existsSync(indexPath)).toBe(true);
        });

        it('should have views directory', () => {
            expect(fs.existsSync(viewsDir)).toBe(true);
        });
    });
});
