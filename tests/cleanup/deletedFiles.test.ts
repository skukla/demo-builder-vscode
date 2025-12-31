/**
 * Deleted Files Verification Tests
 *
 * Step 8: Final Cleanup - verifies that deprecated files have been deleted.
 * These tests ensure that over-engineered code has been removed as planned.
 */

import * as fs from 'fs';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '..', '..');

describe('Deleted Files - Step 8 Final Cleanup', () => {
    describe('Abstract Cache Manager', () => {
        it('should have deleted AbstractCacheManager.ts', () => {
            const filePath = path.join(projectRoot, 'src/core/cache/AbstractCacheManager.ts');
            const exists = fs.existsSync(filePath);
            expect(exists).toBe(false);
        });

        it('should have deleted AbstractCacheManager.test.ts', () => {
            const filePath = path.join(projectRoot, 'tests/core/cache/AbstractCacheManager.test.ts');
            const exists = fs.existsSync(filePath);
            expect(exists).toBe(false);
        });
    });

    describe('Strategy Pattern Files', () => {
        const strategyFiles = [
            'src/core/utils/progressUnifier/strategies/IProgressStrategy.ts',
            'src/core/utils/progressUnifier/strategies/ExactProgressStrategy.ts',
            'src/core/utils/progressUnifier/strategies/MilestoneProgressStrategy.ts',
            'src/core/utils/progressUnifier/strategies/SyntheticProgressStrategy.ts',
            'src/core/utils/progressUnifier/strategies/ImmediateProgressStrategy.ts',
            'src/core/utils/progressUnifier/strategies/index.ts',
        ];

        for (const file of strategyFiles) {
            it(`should have deleted ${path.basename(file)}`, () => {
                const filePath = path.join(projectRoot, file);
                const exists = fs.existsSync(filePath);
                expect(exists).toBe(false);
            });
        }

        it('should have deleted strategies directory entirely', () => {
            const dirPath = path.join(projectRoot, 'src/core/utils/progressUnifier/strategies');
            const exists = fs.existsSync(dirPath);
            expect(exists).toBe(false);
        });
    });

    describe('Helper Classes (inlined to ProgressUnifier)', () => {
        it('should have deleted CommandResolver.ts', () => {
            const filePath = path.join(projectRoot, 'src/core/utils/progressUnifier/CommandResolver.ts');
            const exists = fs.existsSync(filePath);
            expect(exists).toBe(false);
        });

        it('should have deleted ElapsedTimeTracker.ts', () => {
            const filePath = path.join(projectRoot, 'src/core/utils/progressUnifier/ElapsedTimeTracker.ts');
            const exists = fs.existsSync(filePath);
            expect(exists).toBe(false);
        });
    });
});

describe('No Deprecated Imports Remain', () => {
    /**
     * Helper to read all TypeScript files in a directory recursively
     */
    function getAllTsFiles(dir: string): string[] {
        const files: string[] = [];

        function walk(currentDir: string) {
            if (!fs.existsSync(currentDir)) return;

            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    // Skip node_modules and dist
                    if (entry.name !== 'node_modules' && entry.name !== 'dist') {
                        walk(fullPath);
                    }
                } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
                    files.push(fullPath);
                }
            }
        }

        walk(dir);
        return files;
    }

    it('should not import AbstractCacheManager in any source file', () => {
        const srcDir = path.join(projectRoot, 'src');
        const files = getAllTsFiles(srcDir);

        for (const file of files) {
            // Skip the file itself if it still exists (will be deleted)
            if (file.includes('AbstractCacheManager.ts')) continue;

            const content = fs.readFileSync(file, 'utf-8');

            // Check for imports of AbstractCacheManager
            const hasImport = /from\s+['"].*AbstractCacheManager['"]/.test(content);
            const hasExtends = /extends\s+AbstractCacheManager/.test(content);

            if (hasImport || hasExtends) {
                throw new Error(`File ${file} still imports/extends AbstractCacheManager`);
            }
        }
    });

    it('should not import deprecated strategy classes in any source file', () => {
        const srcDir = path.join(projectRoot, 'src');
        const files = getAllTsFiles(srcDir);

        const deprecatedStrategies = [
            'IProgressStrategy',
            'ExactProgressStrategy',
            'MilestoneProgressStrategy',
            'SyntheticProgressStrategy',
            'ImmediateProgressStrategy',
        ];

        for (const file of files) {
            // Skip files in the strategies directory itself
            if (file.includes('progressUnifier/strategies')) continue;

            const content = fs.readFileSync(file, 'utf-8');

            for (const strategy of deprecatedStrategies) {
                const hasImport = new RegExp(`from\\s+['"].*${strategy}['"]`).test(content);
                if (hasImport) {
                    throw new Error(`File ${file} still imports ${strategy}`);
                }
            }
        }
    });

    it('should not import CommandResolver or ElapsedTimeTracker in any source file', () => {
        const srcDir = path.join(projectRoot, 'src');
        const files = getAllTsFiles(srcDir);

        for (const file of files) {
            // Skip the files themselves if they still exist
            if (file.includes('CommandResolver.ts') || file.includes('ElapsedTimeTracker.ts')) continue;

            const content = fs.readFileSync(file, 'utf-8');

            // Check for imports
            const hasCommandResolverImport = /from\s+['"].*CommandResolver['"]/.test(content);
            const hasElapsedTimeTrackerImport = /from\s+['"].*ElapsedTimeTracker['"]/.test(content);

            if (hasCommandResolverImport) {
                throw new Error(`File ${file} still imports CommandResolver`);
            }
            if (hasElapsedTimeTrackerImport) {
                throw new Error(`File ${file} still imports ElapsedTimeTracker`);
            }
        }
    });
});

describe('Canonical Exports Only', () => {
    it('should not export AbstractCacheManager from cache index', async () => {
        // Dynamic import to get actual exports
        const cacheModule = await import('@/core/cache');

        // AbstractCacheManager should NOT be exported
        expect((cacheModule as Record<string, unknown>).AbstractCacheManager).toBeUndefined();

        // But cache utilities should still be exported
        expect(cacheModule.getCacheTTLWithJitter).toBeDefined();
        expect(cacheModule.isExpired).toBeDefined();
        expect(cacheModule.createCacheEntry).toBeDefined();
    });

    it('should not export strategy classes from progressUnifier index', async () => {
        const progressModule = await import('@/core/utils/progressUnifier');

        // Strategy classes should NOT be exported
        expect((progressModule as Record<string, unknown>).IProgressStrategy).toBeUndefined();
        expect((progressModule as Record<string, unknown>).ExactProgressStrategy).toBeUndefined();
        expect((progressModule as Record<string, unknown>).MilestoneProgressStrategy).toBeUndefined();
        expect((progressModule as Record<string, unknown>).SyntheticProgressStrategy).toBeUndefined();
        expect((progressModule as Record<string, unknown>).ImmediateProgressStrategy).toBeUndefined();

        // But ProgressUnifier should still be exported
        expect(progressModule.ProgressUnifier).toBeDefined();
        expect(progressModule.formatElapsedTime).toBeDefined();
    });

    it('should not export CommandResolver or ElapsedTimeTracker from progressUnifier index', async () => {
        const progressModule = await import('@/core/utils/progressUnifier');

        // Helper classes should NOT be exported
        expect((progressModule as Record<string, unknown>).CommandResolver).toBeUndefined();
        expect((progressModule as Record<string, unknown>).ElapsedTimeTracker).toBeUndefined();
    });
});
