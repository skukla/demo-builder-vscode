/**
 * SOP Compliance Test: Inline Styles
 *
 * Verifies that components use CSS classes instead of inline styles where appropriate.
 * Some inline styles are legitimate:
 * - Dynamic values based on props
 * - Spectrum's UNSAFE_style pattern
 * - Style spreading with dynamic props
 *
 * @see docs/development/sop/code-patterns.md - CSS Over Inline Styles
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadLedger, expectCeiling } from './architectureScan';

/**
 * ONE definition of what an inline style IS, shared by the per-file checks and
 * the aggregate ratchet below.
 *
 * They used to have SEPARATE scans of the same question and they disagreed: the
 * ratchet counted `style={{` textually and subtracted dynamic PATTERN HITS, so
 * on 2026-09-10 it read 6 static where this function read 0. Two counters for
 * one rule is one counter that is always wrong somewhere.
 */

function countInlineStyles(content: string): {
    total: number;
    standard: number;
    unsafeStyle: number;
    dynamic: number;
} {
    // A style object that sets ONLY CUSTOM PROPERTIES is not styling — it is
    // passing parameters. `--grid-columns: 3` declares nothing; the rule that
    // reads it lives in a stylesheet, where the cascade can still reach it.
    // That is the sanctioned way out of this list (GridLayout,
    // ContentWithSidebar, ControlPanelLayout, 2026-09-10), so the counter has
    // to recognise it or the way out is "reformat until the regex misses".
    //
    // Anything else in the object and it counts in full: one real declaration
    // welded to the element is the whole problem, however many variables keep
    // it company.
    // BRACE-MATCHED, not lazily regexed. `[\s\S]*?\}` stops at the FIRST `}`,
    // which truncates any multi-line object — and a truncated object loses the
    // properties that would have classified it. TwoColumnLayout's
    // custom-property-only object read as STATIC that way, because the visible
    // fragment happened to contain a comment.
    // COMMENTS BLANKED FIRST. LoadingOverlay's JSDoc carries
    // `<div style={{ position: 'relative' }}>` in an @example, and it was being
    // counted as an inline style in a file that has none — a documented
    // exception granted for a code sample.
    const code = content
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/^[^\S\n]*\/\/[^\n]*/gm, (m) => ' '.repeat(m.length));
    // MATCHES `style={` AND SKIPS AHEAD TO THE OBJECT, so a CONDITIONAL one is
    // seen too. Anchoring on `style={{` missed
    // `style={ cond ? { gridColumn: '1 / -1' } : undefined }` entirely — ReviewStep
    // carried exactly that, and this counter read the file as having zero inline
    // styles right up until a test asserting the declaration failed.
    const styleObjects: string[] = [];
    for (const open of code.matchAll(/(?:UNSAFE_)?style=\{/g)) {
        const brace = code.indexOf('{', open.index + open[0].length);
        if (brace < 0) continue;
        // Only an object literal counts. `style={someVariable}` has no object here
        // to read, and a long or statement-like gap means this is not one.
        // Only an OBJECT LITERAL counts. Between `style={` and the `{` there may be
        // nothing (`style={{`) or a conditional preamble that is still open — i.e.
        // text ending in an operator (`cond ? `, `cond && `). Anything else means
        // this `{` belongs to a later attribute, not to a style object:
        // `style={style}` would otherwise capture the `{` of `className={className}`.
        const between = code.slice(open.index + open[0].length, brace);
        if (between.trim() !== '' && !/[?&|:(]\s*$/.test(between)) continue;
        let depth = 0;
        let i = brace;
        for (; i < code.length; i++) {
            if (code[i] === '{') depth++;
            else if (code[i] === '}') { depth--; if (depth === 0) break; }
        }
        styleObjects.push(code.slice(open.index, i + 1));
    }
    const onlyCustomProps = (obj: string): boolean => {
        // A property name sits after `{` or `,` — NOT after arbitrary
        // whitespace. The looser form read a ternary's `? value : other` as a
        // property called `value`, so an object of nothing but custom
        // properties containing one conditional counted as real styling.
        const props = [...obj.matchAll(/[{,]\s*['"]?(--[\w-]+|[a-zA-Z][\w]*)['"]?\s*:/g)]
            .map((m) => m[1]);
        return props.length > 0 && props.every((k) => k.startsWith('--'));
    };
    const counted = styleObjects.filter((o) => !onlyCustomProps(o));
    const standardMatches = counted.filter((o) => !o.startsWith('UNSAFE_')).length;
    const unsafeMatches = counted.filter((o) => o.startsWith('UNSAFE_')).length;

    // Detect dynamic patterns (spreading, function calls, ternaries)
    const dynamicPatterns = [
        /style=\{\{[^}]*\.\.\./g, // Spreading
        /style=\{\{[^}]*\?[^}]*:/g, // Ternary
        /style=\{\{[^}]*\([^)]+\)/g, // Function calls
    ];

    // STATIC AND DYNAMIC ARE SET COUNTS, and each object lands in exactly one.
    //
    // This used to be `standard = total - dynamicMatches`, where dynamicMatches
    // counted PATTERN HITS across the whole file. An object with both a spread
    // and a ternary counted twice, so the two numbers were not partitions of
    // anything — and removing dynamic objects made the static number RISE while
    // inline styling was falling. That is what it did on 2026-09-10: static
    // read 2, then 6, with no static object added.
    const isDynamic = (obj: string): boolean => dynamicPatterns.some((p) => {
        p.lastIndex = 0;
        return p.test(obj);
    });
    const dynamicCount = counted.filter(isDynamic).length;

    return {
        total: standardMatches,
        standard: counted.filter((o) => !o.startsWith('UNSAFE_') && !isDynamic(o)).length,
        unsafeStyle: unsafeMatches,
        dynamic: dynamicCount,
    };
}

describe('SOP: Inline Styles', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    /**
     * Files with documented exceptions (legitimate inline styles)
     * Each entry explains why inline styles are acceptable
     */
    const DOCUMENTED_EXCEPTIONS: Record<string, string> = {
        // EMPTY, 2026-09-10. Every entry was retired by converting the component,
        // and not one of the reasons survived being checked:
        //
        //   "Dynamic gap/columns from props"  -> parameters, so custom properties
        //                                        with the declaration in CSS.
        //   "Dynamic color/size based on props" (StatusDot) -> `data-variant` was
        //       already on the element, so the colour needed no parameter at all.
        //       Its stated reason — that the dot must be "self-sufficient
        //       regardless of which stylesheets loaded" — was false twice over: the
        //       colour was already a `var(--spectrum-*)`, so a missing stylesheet
        //       gave a correctly-sized INVISIBLE dot; and the failure it feared is
        //       what ADR-017 §6 enforces, verified across all eight bundles.
        //   "Animation styles that must be inline for transitions" -> a data
        //       attribute and a custom property. Nothing must be inline for a
        //       transition; an inline one is merely invisible to the motion rule.
        //   "Spectrum UNSAFE_style for semantic colors" -> a constant colour.
        //       There was nothing dynamic about it.
        //   "CSS Grid layout" / "Inline color/flex" -> static declarations.
        //
        // Adding an entry here means re-arguing that, with a measurement.
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

            expect(undocumented).toStrictEqual([]);
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

            expect(violations).toStrictEqual([]);
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
         * - utilities.css contains ~15 utility classes (.px-3, .mb-2, etc.)
         * - These were added for quick Spectrum component overrides
         * - Removing them would require refactoring all usages
         * - Decision: Document as acceptable debt (LOW priority to remove)
         */
        const KNOWN_UTILITY_CSS_FILES = ['utilities.css'];

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

            expect(violations).toStrictEqual([]);
        });

        it('should document utilities.css as having utility classes', () => {
            /**
             * This test documents the known technical debt in utilities.css.
             *
             * The file contains utility classes (~15 classes) that should ideally
             * be refactored to semantic class names. However, they are widely used
             * and low priority to change.
             *
             * Decision: Keep as acceptable technical debt.
             * Priority: LOW
             * Impact: Maintainability (not functionality)
             */
            expect(KNOWN_UTILITY_CSS_FILES).toContain('utilities.css');
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

            expect(invalidExceptions).toStrictEqual([]);
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
     * Measured 2026-08-30: 23 `style={{` occurrences, 20 dynamic and 3 static.
     * Re-measured 2026-09-10 after the conversion: the two numbers are pinned
     * separately so removing a static one cannot be paid for by adding a dynamic
     * one. A value genuinely computed from props is legitimate — but most of what
     * claimed to be were static values, or parameters that belong in a custom
     * property with the declaration in a stylesheet.
     */
    const LEDGER = loadLedger('webview-architecture-rules.exemptions.json');

    const TSX = execSync("git ls-files 'src/**/*.tsx'", { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);

    function counts(): { total: number; dynamic: number } {
        let total = 0;
        let dynamic = 0;
        for (const f of TSX) {
            const c = countInlineStyles(fs.readFileSync(f, 'utf-8'));
            // `static + dynamic`, not a textual `style={{` count: an object of
            // nothing but custom properties is not styling, and one that matches
            // two dynamic patterns is still one object.
            total += c.standard + c.dynamic + c.unsafeStyle;
            dynamic += c.dynamic;
        }
        return { total, dynamic };
    }

    it('CONTROL: the counter reads a real corpus and can still see a style', () => {
        expect(TSX.length).toBeGreaterThan(50);
        // `counts().total` is ZERO now, so it can no longer serve as the control —
        // an empty corpus and a clean one would look identical. Prove the counter
        // still recognises the thing it is counting instead.
        const planted = countInlineStyles(`<div style={{ color: 'red' }} />`);
        expect(planted.standard).toBe(1);
        const parameters = countInlineStyles(`<div style={{ '--x': y }} />`);
        expect(parameters.standard + parameters.dynamic + parameters.unsafeStyle).toBe(0);
    });

    it('CONTROL: a style object hidden behind a conditional is still counted', () => {
        // Every shape below writes CSS. The counter anchored on `style={{` until
        // 2026-09-09 and saw only the first, so ReviewStep's conditional
        // `gridColumn` read as zero inline styles while it was declaring one.
        const conditional = countInlineStyles(
            `<div style={cond ? { gridColumn: '1 / -1' } : undefined} />`
        );
        expect(conditional.standard).toBe(1);

        const guarded = countInlineStyles(`<div style={cond && { top: 0 }} />`);
        expect(guarded.standard).toBe(1);

        // ...and the NEGATIVE half: `style={variable}` carries no object here, so
        // the `{` that follows belongs to the next attribute and must not be read
        // as one. Without this the guard captures `{className}` and reports a
        // phantom style on every such element.
        const indirect = countInlineStyles(`<div style={styleVar} className={cls} />`);
        expect(indirect.standard + indirect.dynamic + indirect.unsafeStyle).toBe(0);
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
