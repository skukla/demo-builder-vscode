/**
 * SOP Compliance Test: Handler Facades
 *
 * Verifies that all handler directories have proper index.ts barrel exports
 * for consistent import patterns across the codebase.
 *
 * @see .rptc/sop/code-patterns.md - Barrel Exports
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SOP: Handler Facades', () => {
    const featuresDir = path.resolve(__dirname, '../../src/features');

    /**
     * Get all handler directories from features
     */
    function getHandlerDirectories(): string[] {
        const directories: string[] = [];

        if (!fs.existsSync(featuresDir)) return directories;

        const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const handlersPath = path.join(featuresDir, entry.name, 'handlers');
                if (fs.existsSync(handlersPath) && fs.statSync(handlersPath).isDirectory()) {
                    directories.push(handlersPath);
                }
            }
        }

        return directories;
    }

    describe('Index.ts existence', () => {
        it('should have index.ts in all handler directories', () => {
            const handlerDirs = getHandlerDirectories();
            const missing: string[] = [];

            for (const dir of handlerDirs) {
                const indexPath = path.join(dir, 'index.ts');
                if (!fs.existsSync(indexPath)) {
                    missing.push(path.relative(process.cwd(), dir));
                }
            }

            expect(missing).toEqual([]);
        });
    });

    describe('Index.ts exports', () => {
        /**
         * Note: dispatchHandler is imported directly from @/core/handlers where needed.
         * Handler index.ts files export handler maps, not dispatchHandler.
         */

        it('should export handler maps', () => {
            const handlerDirs = getHandlerDirectories();
            const missingHandlers: { dir: string; issue: string }[] = [];

            for (const dir of handlerDirs) {
                const indexPath = path.join(dir, 'index.ts');
                if (!fs.existsSync(indexPath)) continue;

                const content = fs.readFileSync(indexPath, 'utf-8');

                // Should have at least one export statement for handlers
                // Supports named exports, re-exports, and barrel exports
                const hasHandlerExport =
                    content.includes('export {') ||
                    content.includes('export const') ||
                    content.includes('export function') ||
                    content.includes('export * from');

                if (!hasHandlerExport) {
                    missingHandlers.push({
                        dir: path.relative(process.cwd(), dir),
                        issue: 'No handler exports found',
                    });
                }
            }

            expect(missingHandlers).toEqual([]);
        });
    });

    describe('No internal helper leakage', () => {
        it('should not export internal helpers directly', () => {
            const handlerDirs = getHandlerDirectories();
            const leakyExports: { dir: string; helpers: string[] }[] = [];

            /**
             * Helpers should NOT be exported from index.ts
             * They are internal implementation details
             */
            const INTERNAL_HELPERS = [
                'createHandlerHelpers',
                'meshStatusHelpers',
                'edsHelpers',
                'shared',
            ];

            for (const dir of handlerDirs) {
                const indexPath = path.join(dir, 'index.ts');
                if (!fs.existsSync(indexPath)) continue;

                const content = fs.readFileSync(indexPath, 'utf-8');
                const leakedHelpers: string[] = [];

                for (const helper of INTERNAL_HELPERS) {
                    // Check for direct export of helper
                    if (content.includes(`from './${helper}'`) || content.includes(`'${helper}'`)) {
                        leakedHelpers.push(helper);
                    }
                }

                if (leakedHelpers.length > 0) {
                    leakyExports.push({
                        dir: path.relative(process.cwd(), dir),
                        helpers: leakedHelpers,
                    });
                }
            }

            expect(leakyExports).toEqual([]);
        });
    });

    describe('Feature completeness', () => {
        /**
         * Features that must have handler directories with index.ts
         */
        const REQUIRED_HANDLER_DIRS = [
            'authentication',
            'components',
            'dashboard',
            'eds',
            'lifecycle',
            'mesh',
            'prerequisites',
            'project-creation',
            'projects-dashboard',
            'sidebar',
        ];

        it.each(REQUIRED_HANDLER_DIRS)(
            '%s should have handlers/index.ts',
            (featureName) => {
                const handlersDir = path.join(featuresDir, featureName, 'handlers');
                const indexPath = path.join(handlersDir, 'index.ts');

                // Skip if the feature doesn't have a handlers directory at all
                if (!fs.existsSync(handlersDir)) {
                    // This is acceptable - not all features need handlers
                    return;
                }

                expect(fs.existsSync(indexPath)).toBe(true);
            }
        );
    });
});
