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
import { execSync } from 'child_process';
import { loadLedger, expectCeiling } from './architectureScan';

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
        'ContentWithSidebar.tsx': 'Dynamic sidebar inner-content max-width from props',
        'ControlPanelLayout.tsx': 'Dynamic secondary-panel inner-content max-width from props',
        // The Spectrum Flex 450px workaround — this project's OWN prescribed
        // pattern for a full-width webview layout (root CLAUDE.md: "Adobe
        // Spectrum Flex constrains width (450px): use a standard HTML div with
        // flex styles for critical wizard layouts"). Following it necessarily
        // produces an inline style, so these are exceptions by construction
        // rather than by oversight.
        // The evaluation surface has NO exceptions any more. Step 10's visual
        // pass (2026-08-25) moved its whole layout into `workbench.css`, which
        // is where it belonged: the look needs hover states, `::before`
        // separators and `tabular-nums`, none of which an inline style can
        // express. The Spectrum-Flex-450px trap is still avoided — the panel is
        // plain divs — it is just that the flex now lives in a class.
        // Components with conditional styles
        'StatusDot.tsx': 'Dynamic color/size based on props',
        'FadeTransition.tsx': 'Animation styles that must be inline for transitions',
        'LoadingOverlay.tsx': 'Position relative for overlay stacking context',

        // Spectrum UNSAFE_style (required for Spectrum overrides)
        'SearchHeader.tsx': 'Spectrum UNSAFE_style for theme integration',
        'TimelineNav.tsx': 'Spectrum UNSAFE_style for background colors',
        'timelineNav.helpers.tsx': 'Spectrum UNSAFE_style for true-white inner dot',
        'VerifiedField.tsx': 'Spectrum UNSAFE_style for semantic colors',

        // Grid layouts (CSS Grid properties for complex layouts)
        'ReviewStep.tsx': 'CSS Grid layout for two-column review summary',

        // Pin indicators for projects (single-property style for inline icon color)
        'ProjectCard.tsx': 'Inline color/flex style for the inline pin indicator next to project name',
        'ProjectRow.tsx': 'Inline color/flex style for the inline pin indicator next to project name',

        // AppBuilderComponent secret input (dashboard UI convention: box-sizing on width:100% input)
        'SecretFieldRow.tsx': 'box-sizing:border-box on a width:100% masked input (dashboard UI convention)',

        // Store structure listbox container
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

        it('CONTROL: the scan sees a corpus worth scanning', () => {
            // Every count below is taken over this walk. If it returns nothing the
            // counts are all zero and the suite passes while looking at no files.
            const srcDir = path.resolve(__dirname, '../../src');
            expect(getTsxFiles(srcDir).length).toBeGreaterThan(100);
        });

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

describe('ADR-017: styling reaches Spectrum through cn(), not style objects', () => {
    /**
     * The suite above caps STATIC inline styles at five per FILE. That bounds how
     * bad any one file gets, and says nothing about the total — twenty files could
     * each add four and every check would stay green.
     *
     * This pins the aggregate. It is what makes the convention enforced rather than
     * merely bounded: the direction of travel is one way, and a fall gets locked in
     * so it cannot be spent again.
     *
     * Measured 2026-08-30: 23 `style={{` occurrences, of which 20 are dynamic
     * (spread, ternary or call) and 3 are static. Dynamic ones are legitimate — a
     * value computed from props cannot live in a stylesheet — so both numbers are
     * pinned separately rather than lumped together, or removing a static one could
     * be paid for by adding a dynamic one.
     */
    const LEDGER = loadLedger('webview-architecture-rules.exemptions.json');
    const DYNAMIC = [
        /style=\{\{[^}]*\.\.\./g,
        /style=\{\{[^}]*\?[^}]*:/g,
        /style=\{\{[^}]*\([^)]+\)/g,
    ];

    const TSX = execSync("git ls-files 'src/**/*.tsx'", { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);

    function counts(): { total: number; dynamic: number } {
        let total = 0;
        let dynamic = 0;
        for (const f of TSX) {
            const c = fs.readFileSync(f, 'utf-8');
            total += (c.match(/style=\{\{/g) ?? []).length;
            for (const p of DYNAMIC) dynamic += (c.match(p) ?? []).length;
        }
        return { total, dynamic };
    }

    it('CONTROL: the counter reads a real corpus', () => {
        expect(TSX.length).toBeGreaterThan(50);
        expect(counts().total).toBeGreaterThan(0);
    });

    it('the static count never grows, and a fall is pinned', () => {
        const { total, dynamic } = counts();
        expectCeiling(LEDGER, 'staticInlineStyleCeiling', total - dynamic);
    });

    it('the dynamic count never grows, and a fall is pinned', () => {
        // Legitimate, but not unlimited — an unpinned escape hatch becomes the path.
        expectCeiling(LEDGER, 'dynamicInlineStyleCeiling', counts().dynamic);
    });
});
