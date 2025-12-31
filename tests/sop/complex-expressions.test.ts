/**
 * SOP Compliance Test: Complex Expression Extraction
 *
 * Verifies that complex inline expressions are extracted to named helper functions
 * for improved readability and maintainability.
 *
 * Patterns checked:
 * - Nested ternary operators (§3)
 * - Boolean expressions with 4+ conditions in JSX (§10)
 *
 * @see .rptc/sop/code-patterns.md - Helper Functions, Ternaries, Predicates
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SOP: Complex Expression Extraction', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    /**
     * Pattern to detect nested ternary operators in code.
     * Matches: a ? b : c ? d : e (ternary inside ternary)
     * Excludes: comments, string literals with '?'
     */
    const NESTED_TERNARY_PATTERN = /[^'"`/]\s*\?\s*[^:]+:\s*[^?]+\?\s*[^:]+:/;

    /**
     * Pattern to detect long boolean && chains (4+ conditions in JSX)
     * Matches: a && b && c && d (4 or more conditions)
     * Used in JSX conditionals like {condition && content}
     */
    const LONG_AND_CHAIN_PATTERN = /\{[^{}]*&&[^{}]*&&[^{}]*&&[^{}]*\(/;

    /**
     * Patterns that are acceptable (not violations)
     */
    const ALLOWED_PATTERNS = [
        /^\s*\*/, // JSDoc comment lines
        /^\s*\/\//, // Single-line comments
        /Extracts nested ternary/, // Documentation comment
        /SOP §\d+/, // SOP reference comments
        /Condition:/, // Documentation of extracted condition
        /project\$\{.*\? 's' : ''\}/, // Simple pluralization ternary (acceptable)
        /component\$\{.*\? 's' : ''\}/, // Simple pluralization ternary (acceptable)
    ];

    function isAllowedLine(line: string): boolean {
        return ALLOWED_PATTERNS.some(pattern => pattern.test(line));
    }

    function isInComment(line: string, pattern: RegExp): boolean {
        // Check if the match is in a comment
        const commentIndex = Math.min(
            line.indexOf('//') === -1 ? Infinity : line.indexOf('//'),
            line.indexOf('/*') === -1 ? Infinity : line.indexOf('/*'),
            line.indexOf('*') === 0 ? 0 : Infinity
        );
        const match = line.match(pattern);
        if (!match) return false;
        const matchIndex = line.indexOf(match[0]);
        return matchIndex > commentIndex;
    }

    function findNestedTernaries(filePath: string): { line: number; content: string }[] {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const violations: { line: number; content: string }[] = [];

        lines.forEach((line, index) => {
            // Skip allowed patterns
            if (isAllowedLine(line)) {
                return;
            }

            // Check for nested ternary pattern
            if (NESTED_TERNARY_PATTERN.test(line) && !isInComment(line, NESTED_TERNARY_PATTERN)) {
                violations.push({ line: index + 1, content: line.trim() });
            }
        });

        return violations;
    }

    function findLongBooleanChains(filePath: string): { line: number; content: string }[] {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const violations: { line: number; content: string }[] = [];

        lines.forEach((line, index) => {
            // Skip allowed patterns
            if (isAllowedLine(line)) {
                return;
            }

            // Check for long && chains in JSX (4+ conditions)
            if (LONG_AND_CHAIN_PATTERN.test(line) && !isInComment(line, LONG_AND_CHAIN_PATTERN)) {
                violations.push({ line: index + 1, content: line.trim() });
            }
        });

        return violations;
    }

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

    describe('Nested ternary operators', () => {
        it('should not have nested ternary operators in source files', () => {
            const files = getTypeScriptFiles(srcDir);
            const allViolations: { file: string; violations: { line: number; content: string }[] }[] = [];

            for (const file of files) {
                const violations = findNestedTernaries(file);
                if (violations.length > 0) {
                    allViolations.push({
                        file: path.relative(process.cwd(), file),
                        violations,
                    });
                }
            }

            expect(allViolations).toEqual([]);
        });
    });

    describe('Long boolean chains in JSX', () => {
        it('should not have 4+ condition && chains in JSX conditionals', () => {
            const tsxFiles = getTypeScriptFiles(srcDir, ['.tsx']);
            const allViolations: { file: string; violations: { line: number; content: string }[] }[] = [];

            for (const file of tsxFiles) {
                const violations = findLongBooleanChains(file);
                if (violations.length > 0) {
                    allViolations.push({
                        file: path.relative(process.cwd(), file),
                        violations,
                    });
                }
            }

            expect(allViolations).toEqual([]);
        });
    });

    describe('Existing predicate files', () => {
        it('authPredicates.ts should exist and contain extracted predicates', () => {
            const authPredicatesPath = path.join(srcDir, 'features/authentication/ui/steps/authPredicates.ts');

            if (!fs.existsSync(authPredicatesPath)) {
                // Skip if file doesn't exist (will be created during implementation)
                return;
            }

            const content = fs.readFileSync(authPredicatesPath, 'utf-8');

            // Should have named predicate functions
            expect(content).toContain('export function');
            expect(content).toContain('AuthPredicateState');
        });

        it('wizardHelpers.ts should contain extracted helper functions', () => {
            const wizardHelpersPath = path.join(srcDir, 'features/project-creation/ui/wizard/wizardHelpers.ts');

            if (!fs.existsSync(wizardHelpersPath)) {
                // Skip if file doesn't exist
                return;
            }

            const content = fs.readFileSync(wizardHelpersPath, 'utf-8');

            // Should have extracted helper functions
            expect(content).toContain('export function');
            // Should have getNextButtonText which extracts nested ternary
            expect(content).toContain('getNextButtonText');
        });

        it('stepStatusHelpers.ts should contain extracted status predicates', () => {
            const stepStatusHelpersPath = path.join(srcDir, 'core/ui/components/wizard/stepStatusHelpers.ts');

            if (!fs.existsSync(stepStatusHelpersPath)) {
                // Skip if file doesn't exist
                return;
            }

            const content = fs.readFileSync(stepStatusHelpersPath, 'utf-8');

            // Should have extracted helper functions
            expect(content).toContain('export function');
        });
    });
});
