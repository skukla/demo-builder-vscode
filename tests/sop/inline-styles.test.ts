/**
 * SOP Compliance Test: Inline Styles
 *
 * Verifies that components use CSS classes instead of inline styles where appropriate.
 * Some inline styles are legitimate:
 * - Dynamic values based on props
 * - Spectrum's UNSAFE_style pattern
 * - Style spreading with dynamic props
 *
 * @see .rptc/sop/code-patterns.md - CSS Over Inline Styles
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SOP: Inline Styles', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    /**
     * Files with documented exceptions (legitimate inline styles)
     * Each entry explains why inline styles are acceptable
     */
    const DOCUMENTED_EXCEPTIONS: Record<string, string> = {
        // Layout components with dynamic props
        'GridLayout.tsx': 'Dynamic gap/columns from props via translateSpectrumToken()',
        'TwoColumnLayout.tsx': 'Dynamic gap/ratio from props via translateSpectrumToken()',
        'PageLayout.tsx': 'Dynamic backgroundColor from props',
        'SingleColumnLayout.tsx': 'Dynamic gap from props via translateSpectrumToken()',
        // Components with conditional styles
        'WizardProgress.tsx': 'Dynamic cursor based on onClick prop',
        'StatusDot.tsx': 'Dynamic color/size based on props',
        'FadeTransition.tsx': 'Animation styles that must be inline for transitions',
        'LoadingOverlay.tsx': 'Position relative for overlay stacking context',
        'SidebarNav.tsx': 'Dynamic styles for navigation items',
        'Sidebar.tsx': 'Flex container for scrollable wizard progress',

        // Spectrum UNSAFE_style (required for Spectrum overrides)
        'SearchHeader.tsx': 'Spectrum UNSAFE_style for theme integration',
        'TimelineNav.tsx': 'Spectrum UNSAFE_style for background colors',
        'VerifiedField.tsx': 'Spectrum UNSAFE_style for semantic colors',
        'DaLiveOrgConfigSection.tsx': 'Spectrum UNSAFE_style for icon vertical alignment',

        // Grid layouts (CSS Grid properties for complex layouts)
        'ReviewStep.tsx': 'CSS Grid layout for two-column review summary',

        // Dashboard link positioning
        'ProjectDashboardScreen.tsx': 'Spectrum UNSAFE_style for auth link margin',

        // Modal/dialog layout stability
        'GitHubRepoSelectionStep.tsx': 'Fixed height container prevents modal resize during status recheck',
    };

    /**
     * Get all TSX files from src directory
     */
    function getTsxFiles(dir: string): string[] {
        const files: string[] = [];

        function walkDir(currentDir: string) {
            if (!fs.existsSync(currentDir)) return;

            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory() && entry.name !== 'node_modules') {
                    walkDir(fullPath);
                } else if (
                    entry.isFile() &&
                    entry.name.endsWith('.tsx') &&
                    !entry.name.includes('.test.')
                ) {
                    files.push(fullPath);
                }
            }
        }

        walkDir(dir);
        return files;
    }

    /**
     * Count inline style occurrences in a file
     * Returns both total count and breakdown
     */
    function countInlineStyles(content: string): {
        total: number;
        standard: number;
        unsafeStyle: number;
        dynamic: number;
    } {
        const standardMatches = (content.match(/style=\{\{/g) || []).length;
        const unsafeMatches = (content.match(/UNSAFE_style=\{\{/g) || []).length;

        // Detect dynamic patterns (spreading, function calls, ternaries)
        const dynamicPatterns = [
            /style=\{\{[^}]*\.\.\./g, // Spreading
            /style=\{\{[^}]*\?[^}]*:/g, // Ternary
            /style=\{\{[^}]*\([^)]+\)/g, // Function calls
        ];

        let dynamicCount = 0;
        for (const pattern of dynamicPatterns) {
            dynamicCount += (content.match(pattern) || []).length;
        }

        return {
            total: standardMatches,
            standard: standardMatches - dynamicCount,
            unsafeStyle: unsafeMatches,
            dynamic: dynamicCount,
        };
    }

    describe('Inline style documentation', () => {
        it('should have all files with inline styles documented', () => {
            const files = getTsxFiles(srcDir);
            const undocumented: string[] = [];

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');
                const fileName = path.basename(file);
                const counts = countInlineStyles(content);

                // If file has inline styles (excluding UNSAFE_style which is a different pattern)
                if (counts.total > 0 && !DOCUMENTED_EXCEPTIONS[fileName]) {
                    undocumented.push(`${fileName} (${counts.total} inline styles)`);
                }
            }

            expect(undocumented).toEqual([]);
        });
    });

    describe('Inline style thresholds', () => {
        /**
         * Maximum allowed static inline styles per file
         * Dynamic styles and UNSAFE_style don't count against this limit
         */
        const MAX_STATIC_INLINE_STYLES = 5;

        it('should not have excessive static inline styles in any file', () => {
            const files = getTsxFiles(srcDir);
            const violations: { file: string; staticCount: number }[] = [];

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');
                const counts = countInlineStyles(content);

                // Static inline styles = total - dynamic
                // (we don't count UNSAFE_style as it's a Spectrum pattern)
                if (counts.standard > MAX_STATIC_INLINE_STYLES) {
                    violations.push({
                        file: path.basename(file),
                        staticCount: counts.standard,
                    });
                }
            }

            expect(violations).toEqual([]);
        });
    });

    describe('CSS class usage', () => {
        /**
         * Check that layout components use CSS classes for static styles
         */
        const LAYOUT_COMPONENTS = [
            'PageFooter.tsx',
        ];

        it.each(LAYOUT_COMPONENTS)(
            '%s should prefer CSS classes for static positioning',
            (fileName) => {
                const files = getTsxFiles(srcDir);
                const file = files.find((f) => f.endsWith(fileName));

                if (!file) {
                    // File doesn't exist, skip
                    return;
                }

                const content = fs.readFileSync(file, 'utf-8');

                // Check for simple static inline styles that could be CSS classes
                const simpleStaticPatterns = [
                    /style=\{\{\s*justifySelf:\s*'[^']+'\s*\}\}/g,
                    /style=\{\{\s*textAlign:\s*'[^']+'\s*\}\}/g,
                    /style=\{\{\s*display:\s*'[^']+'\s*\}\}/g,
                ];

                let simpleStaticCount = 0;
                for (const pattern of simpleStaticPatterns) {
                    simpleStaticCount += (content.match(pattern) || []).length;
                }

                // Allow up to 3 simple static inline styles
                expect(simpleStaticCount).toBeLessThanOrEqual(3);
            }
        );
    });

    describe('No utility class explosion', () => {
        /**
         * Verify we don't have excessive Tailwind-like utility classes.
         *
         * Pre-existing Technical Debt:
         * - custom-spectrum.css contains ~15 utility classes (.px-3, .mb-2, etc.)
         * - These were added for quick Spectrum component overrides
         * - Removing them would require refactoring all usages
         * - Decision: Document as acceptable debt (LOW priority to remove)
         */
        const KNOWN_UTILITY_CSS_FILES = ['custom-spectrum.css'];

        it('should not have utility class patterns in non-documented CSS files', () => {
            const cssDir = path.resolve(__dirname, '../../src/core/ui/styles');
            if (!fs.existsSync(cssDir)) return;

            const cssFiles = fs.readdirSync(cssDir)
                .filter((f) => f.endsWith('.css'))
                .filter((f) => !KNOWN_UTILITY_CSS_FILES.includes(f));

            const violations: { file: string; classes: string[] }[] = [];

            const utilityPatterns = [
                /\.(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py)-\d+/g, // Margin/padding utilities
                /\.flex-\d+/g, // Flex utilities
                /\.w-\d+/g, // Width utilities
                /\.h-\d+/g, // Height utilities
            ];

            for (const cssFile of cssFiles) {
                const content = fs.readFileSync(path.join(cssDir, cssFile), 'utf-8');
                const foundUtilities: string[] = [];

                for (const pattern of utilityPatterns) {
                    const matches = content.match(pattern) || [];
                    foundUtilities.push(...matches);
                }

                if (foundUtilities.length > 0) {
                    violations.push({
                        file: cssFile,
                        classes: foundUtilities,
                    });
                }
            }

            expect(violations).toEqual([]);
        });

        it('should document custom-spectrum.css as having utility classes', () => {
            /**
             * This test documents the known technical debt in custom-spectrum.css.
             *
             * The file contains utility classes (~15 classes) that should ideally
             * be refactored to semantic class names. However, they are widely used
             * and low priority to change.
             *
             * Decision: Keep as acceptable technical debt.
             * Priority: LOW
             * Impact: Maintainability (not functionality)
             */
            expect(KNOWN_UTILITY_CSS_FILES).toContain('custom-spectrum.css');
        });
    });

    describe('Exception documentation completeness', () => {
        it('should have all documented exceptions still valid', () => {
            const files = getTsxFiles(srcDir);
            const invalidExceptions: string[] = [];

            for (const [fileName, _reason] of Object.entries(DOCUMENTED_EXCEPTIONS)) {
                const fileExists = files.some((f) => f.endsWith(fileName));
                if (!fileExists) {
                    invalidExceptions.push(`${fileName} - File no longer exists`);
                    continue;
                }

                const file = files.find((f) => f.endsWith(fileName))!;
                const content = fs.readFileSync(file, 'utf-8');
                const counts = countInlineStyles(content);

                // Check that the file still has inline styles
                if (counts.total === 0 && counts.unsafeStyle === 0) {
                    invalidExceptions.push(
                        `${fileName} - No longer has inline styles (remove from exceptions)`
                    );
                }
            }

            expect(invalidExceptions).toEqual([]);
        });
    });
});
