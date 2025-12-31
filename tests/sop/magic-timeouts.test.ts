/**
 * SOP Compliance Test: Magic Timeout Constants
 *
 * Verifies that UI components use FRONTEND_TIMEOUTS constants
 * instead of hardcoded numeric values for timing.
 *
 * @see .rptc/sop/code-patterns.md - Centralized Timeout Constants
 */

import * as fs from 'fs';
import * as path from 'path';

describe('SOP: Magic Timeout Constants', () => {
    const uiComponentsDir = path.resolve(__dirname, '../../src/core/ui/components');
    const frontendTimeoutsPath = path.resolve(__dirname, '../../src/core/ui/utils/frontendTimeouts.ts');

    /**
     * Pattern to detect magic timeout numbers in code.
     * Looks for:
     * - setTimeout with numeric literals (100+)
     * - const assignments with numeric literals for timing (100+)
     * - Excludes: imports, FRONTEND_TIMEOUTS usage, legitimate numeric constants
     */
    const MAGIC_TIMEOUT_PATTERNS = [
        // setTimeout with raw numbers (e.g., setTimeout(fn, 2000))
        /setTimeout\s*\([^)]+,\s*\d{3,}\s*\)/g,
        // Timing constant assignments (e.g., const DELAY = 500)
        /const\s+(?:ANIMATION_DURATION|DELAY|TIMEOUT|INIT_DELAY|DURATION|MS)\s*=\s*\d{3,}/gi,
    ];

    /**
     * Patterns that are acceptable (not violations)
     */
    const ALLOWED_PATTERNS = [
        /FRONTEND_TIMEOUTS\./,
        /TIMEOUTS\./,
        /\/\/ Intentionally standalone/,
        /bookmarklet/i, // Bookmarklet code runs in browser, not subject to this rule
    ];

    function isAllowedLine(line: string): boolean {
        return ALLOWED_PATTERNS.some(pattern => pattern.test(line));
    }

    function findMagicTimeouts(filePath: string): { line: number; content: string }[] {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const violations: { line: number; content: string }[] = [];

        lines.forEach((line, index) => {
            // Skip allowed patterns
            if (isAllowedLine(line)) {
                return;
            }

            // Check for magic timeout patterns
            for (const pattern of MAGIC_TIMEOUT_PATTERNS) {
                if (pattern.test(line)) {
                    violations.push({ line: index + 1, content: line.trim() });
                    break;
                }
                // Reset regex lastIndex for global patterns
                pattern.lastIndex = 0;
            }
        });

        return violations;
    }

    function getTypeScriptFiles(dir: string): string[] {
        const files: string[] = [];

        function walkDir(currentDir: string) {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) {
                    files.push(fullPath);
                }
            }
        }

        if (fs.existsSync(dir)) {
            walkDir(dir);
        }
        return files;
    }

    describe('FRONTEND_TIMEOUTS constants exist', () => {
        it('should have FRONTEND_TIMEOUTS file', () => {
            expect(fs.existsSync(frontendTimeoutsPath)).toBe(true);
        });

        it('should export FRONTEND_TIMEOUTS object', () => {
            const content = fs.readFileSync(frontendTimeoutsPath, 'utf-8');
            expect(content).toContain('export const FRONTEND_TIMEOUTS');
        });

        it('should have ANIMATION_SETTLE constant for animation durations', () => {
            const content = fs.readFileSync(frontendTimeoutsPath, 'utf-8');
            expect(content).toContain('ANIMATION_SETTLE');
        });
    });

    describe('UI components use FRONTEND_TIMEOUTS', () => {
        it('TimelineNav.tsx should not have magic timeout numbers', () => {
            const filePath = path.join(uiComponentsDir, 'TimelineNav.tsx');
            if (!fs.existsSync(filePath)) {
                // File doesn't exist yet - skip
                return;
            }

            const violations = findMagicTimeouts(filePath);

            expect(violations).toEqual([]);
        });

        it('should not have magic timeout numbers in core UI components', () => {
            const files = getTypeScriptFiles(uiComponentsDir);
            const allViolations: { file: string; violations: { line: number; content: string }[] }[] = [];

            for (const file of files) {
                const violations = findMagicTimeouts(file);
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
});
