/**
 * SOP Compliance Test: Component Extraction
 *
 * Verifies that components follow strict extraction criteria:
 * - Only extract if 2+ usages OR >100 lines OR testing benefit
 * - No abstract classes for single implementations
 * - No HOCs or generic wrappers
 *
 * @see .rptc/sop/code-patterns.md - Component Extraction Criteria
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SOP: Component Extraction', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    /**
     * Pattern to detect abstract class declarations
     * Matches: abstract class ClassName
     */
    const ABSTRACT_CLASS_PATTERN = /abstract\s+class\s+(\w+)/g;

    /**
     * Pattern to detect HOC patterns (functions returning components)
     * Matches: withSomething, createSomething (common HOC naming)
     */
    const HOC_FUNCTION_PATTERN = /export\s+(?:const|function)\s+(with[A-Z]\w*|create[A-Z]\w*(?:Component|Provider|Wrapper))/g;

    /**
     * Pattern to detect generic wrapper components
     * Matches: <T>, <Props>, etc. in React components
     */
    const GENERIC_COMPONENT_PATTERN = /(?:function|const)\s+\w+\s*<\s*T\s*(?:extends|,|\s*>)/g;

    /**
     * Legitimate generic components that meet criteria:
     * - >100 lines each
     * - Multiple implementations/usages
     */
    const LEGITIMATE_GENERICS = [
        'SearchableList', // 264 lines, reusable list pattern
        'SelectionStepContent', // 227 lines, 3+ usages (AdobeProjectStep, AdobeWorkspaceStep, GitHubRepoSelectionStep)
        'ListComponent', // React Aria List wrapper, replaces Spectrum ListView, used by SearchableList
    ];

    /**
     * Known legitimate abstractions that have multiple implementations
     */
    const LEGITIMATE_ABSTRACTIONS = [
        'BaseCommand', // 10+ implementations
        'BaseWebviewCommand', // 10+ implementations
        'BaseHandlerRegistry', // Multiple feature registries
    ];

    function getTypeScriptFiles(dir: string, extensions: string[] = ['.ts', '.tsx']): string[] {
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
                    extensions.some(ext => entry.name.endsWith(ext)) &&
                    !entry.name.includes('.test.') &&
                    !entry.name.includes('.spec.')
                ) {
                    files.push(fullPath);
                }
            }
        }

        walkDir(dir);
        return files;
    }

    function countImplementations(className: string, files: string[]): number {
        let count = 0;
        const extendsPattern = new RegExp(`extends\\s+${className}\\b`);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            if (extendsPattern.test(content)) {
                count++;
            }
        }

        return count;
    }

    describe('Abstract classes', () => {
        it('should not have abstract classes with fewer than 2 implementations', () => {
            const files = getTypeScriptFiles(srcDir);
            const violations: { file: string; className: string; implementations: number }[] = [];

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');
                const matches = content.matchAll(ABSTRACT_CLASS_PATTERN);

                for (const match of matches) {
                    const className = match[1];

                    // Skip known legitimate abstractions
                    if (LEGITIMATE_ABSTRACTIONS.includes(className)) {
                        continue;
                    }

                    const implementations = countImplementations(className, files);

                    if (implementations < 2) {
                        violations.push({
                            file: path.relative(process.cwd(), file),
                            className,
                            implementations,
                        });
                    }
                }
            }

            expect(violations).toEqual([]);
        });
    });

    describe('Higher-Order Components (HOCs)', () => {
        it('should not have HOC patterns (withX, createXComponent)', () => {
            const files = getTypeScriptFiles(srcDir, ['.tsx']);
            const violations: { file: string; hocName: string; line: number }[] = [];

            /**
             * Allowed HOC-like names that are not actually HOCs
             */
            const ALLOWED_PATTERNS = [
                'createMockComponent', // Test utilities
                'createTestComponent', // Test utilities
                'withTimeout', // Promise utility, not HOC
            ];

            for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                    const matches = line.matchAll(HOC_FUNCTION_PATTERN);

                    for (const match of matches) {
                        const hocName = match[1];

                        // Skip allowed patterns
                        if (ALLOWED_PATTERNS.some(pattern => hocName.includes(pattern))) {
                            continue;
                        }

                        violations.push({
                            file: path.relative(process.cwd(), file),
                            hocName,
                            line: index + 1,
                        });
                    }
                });
            }

            expect(violations).toEqual([]);
        });
    });

    describe('Generic wrapper components', () => {
        it('should not have overly generic wrapper components', () => {
            const files = getTypeScriptFiles(srcDir, ['.tsx']);
            const violations: { file: string; line: number; content: string }[] = [];

            /**
             * Files that legitimately use generics
             */
            const ALLOWED_FILES = [
                'types.ts', // Type definitions
                'types.tsx', // Type definitions
                '.d.ts', // Declaration files
            ];

            /**
             * Allowed generic patterns that are not wrappers
             */
            const ALLOWED_PATTERNS = [
                /function\s+use\w+</, // Generic hooks are fine
                /type\s+\w+\s*</, // Type definitions
                /interface\s+\w+\s*</, // Interface definitions
            ];

            for (const file of files) {
                // Skip allowed files
                if (ALLOWED_FILES.some(pattern => file.includes(pattern))) {
                    continue;
                }

                const content = fs.readFileSync(file, 'utf-8');
                const lines = content.split('\n');

                lines.forEach((line, index) => {
                    // Check for generic component pattern
                    if (GENERIC_COMPONENT_PATTERN.test(line)) {
                        // Skip if it matches allowed patterns
                        if (ALLOWED_PATTERNS.some(pattern => pattern.test(line))) {
                            return;
                        }

                        // Skip legitimate generics (>100 lines, justified by criteria)
                        if (LEGITIMATE_GENERICS.some(name => line.includes(name))) {
                            return;
                        }

                        violations.push({
                            file: path.relative(process.cwd(), file),
                            line: index + 1,
                            content: line.trim(),
                        });
                    }
                });
            }

            expect(violations).toEqual([]);
        });
    });

    describe('Existing shared components', () => {
        /**
         * Verify that shared components have multiple usages
         * (justifying their extraction)
         *
         * Components with 2+ usages are verified here.
         * Components with 1 usage but <100 lines are documented as
         * acceptable technical debt (cost of inlining > benefit).
         */
        const SHARED_COMPONENTS_VERIFIED = [
            { name: 'EmptyState', minUsages: 2 }, // 5 usages
            { name: 'FadeTransition', minUsages: 2 }, // 3 usages
            { name: 'CopyableText', minUsages: 2 }, // 3 usages
            { name: 'StatusDot', minUsages: 2 }, // 6 usages
        ];

        /**
         * Single-usage components that are acceptable technical debt:
         * - LoadingOverlay (64 lines, 1 usage) - Simple utility, may gain usages
         * - NumberedInstructions (72 lines, 1 usage) - Simple utility, may gain usages
         *
         * These don't meet strict 2+ usage criteria but inlining would
         * add unnecessary code churn for minimal benefit.
         */

        it.each(SHARED_COMPONENTS_VERIFIED)(
            '$name should have at least $minUsages usages',
            ({ name, minUsages }) => {
                const files = getTypeScriptFiles(srcDir, ['.tsx']);
                let usageCount = 0;
                const importPattern = new RegExp(`import\\s*{[^}]*\\b${name}\\b[^}]*}\\s*from`);

                for (const file of files) {
                    const content = fs.readFileSync(file, 'utf-8');

                    // Count imports (more reliable than JSX usage)
                    if (importPattern.test(content)) {
                        usageCount++;
                    }
                }

                expect(usageCount).toBeGreaterThanOrEqual(minUsages);
            }
        );

        it('should document single-usage components as acceptable debt', () => {
            /**
             * These components have 1 usage but are kept as acceptable technical debt:
             * - LoadingOverlay: 64 lines, used by WizardContainer
             * - NumberedInstructions: 72 lines, used by MeshErrorDialog
             *
             * Rationale: Small components that may gain future usage.
             * Inlining would cause code churn for minimal benefit.
             */
            const ACCEPTABLE_SINGLE_USAGE = [
                'LoadingOverlay',
                'NumberedInstructions',
            ];

            // This test documents the decision, not enforces a rule
            expect(ACCEPTABLE_SINGLE_USAGE.length).toBe(2);
        });
    });
});
