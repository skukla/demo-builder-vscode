/**
 * Tests for check-test-file-sizes CI/CD script
 *
 * Validates that the script correctly detects oversized test files
 * and enforces the 750-line maximum threshold.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('check-test-file-sizes script', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'check-test-file-sizes.js');
    // OUTSIDE the repo, deliberately. These fixtures are named `*.test.ts` and were
    // written into `tests/scripts/__temp_test_files__/`, where EIGHT SOP suites walk
    // the tests tree looking for exactly that pattern. Jest runs suites in parallel
    // workers, so a walker could list a fixture and then read it after this suite's
    // afterEach had deleted it — an ENOENT that surfaced as an unrelated SOP failure
    // and vanished on re-run. Keyed by pid so concurrent runs cannot collide.
    const tempTestDir = path.join(os.tmpdir(), `demo-builder-file-size-fixtures-${process.pid}`);

    beforeEach(() => {
        // Create temp test directory with tests/ subdirectory
        if (fs.existsSync(tempTestDir)) {
            fs.rmSync(tempTestDir, { recursive: true, force: true });
        }
        fs.mkdirSync(path.join(tempTestDir, 'tests'), { recursive: true });
    });

    afterEach(() => {
        // Clean up temp files
        if (fs.existsSync(tempTestDir)) {
            fs.rmSync(tempTestDir, { recursive: true, force: true });
        }
    });

    it('should fail when test file exceeds 750 lines', () => {
        // Arrange: Create 800-line test file
        const oversizedFile = path.join(tempTestDir, 'tests', 'oversized.test.ts');
        fs.writeFileSync(oversizedFile, 'test line\n'.repeat(800));

        // Act & Assert: Script should exit with error
        expect(() => {
            execSync(`node ${scriptPath} ${tempTestDir}`, { encoding: 'utf8' });
        }).toThrow();
    });

    it('should pass when all files are under 750 lines', () => {
        // Arrange: Create compliant test file
        const compliantFile = path.join(tempTestDir, 'tests', 'compliant.test.ts');
        fs.writeFileSync(compliantFile, 'test line\n'.repeat(500));

        // Act: Script should succeed
        const result = execSync(`node ${scriptPath} ${tempTestDir}`, {
            encoding: 'utf8',
        });

        // Assert: No errors
        expect(result).toContain('All test files within size limits');
    });

    it('should respect exclusion list', () => {
        // Arrange: Create excluded oversized file
        const excludedFile = path.join(tempTestDir, 'tests', 'legacy.integration.test.ts');
        fs.writeFileSync(excludedFile, 'test line\n'.repeat(800));

        // Create exclusion config
        const configFile = path.join(tempTestDir, '.testfilesizerc.json');
        fs.writeFileSync(
            configFile,
            JSON.stringify({
                exclude: ['legacy.integration.test.ts'],
            })
        );

        // Act: Script should succeed despite oversized file
        const result = execSync(`node ${scriptPath} ${tempTestDir}`, {
            encoding: 'utf8',
        });

        // Assert: Excluded file not flagged
        expect(result).toContain('All test files within size limits');
    });

    it('should warn about files between 500-750 lines', () => {
        // Arrange: Create file in warning zone
        const warningFile = path.join(tempTestDir, 'tests', 'warning.test.ts');
        fs.writeFileSync(warningFile, 'test line\n'.repeat(600));

        // Act: Script should succeed but warn
        const result = execSync(`node ${scriptPath} ${tempTestDir}`, {
            encoding: 'utf8',
        });

        // Assert: Warning present but no error
        expect(result).toContain('warning');
        expect(result).toContain('601 lines');
    });

    it('should report file paths relative to project root', () => {
        // Arrange: Create test file in subdirectory
        const testFile = path.join(tempTestDir, 'tests', 'subdir', 'test.test.ts');
        fs.mkdirSync(path.dirname(testFile), { recursive: true });
        fs.writeFileSync(testFile, 'test line\n'.repeat(800));

        // Act: capture the outcome without asserting inside the catch.
        //
        // THE OLD VERSION COULD NOT FAIL. It asserted only in the catch and had no
        // `fail()` in the try, so if the size check ever stopped exiting non-zero —
        // exactly the regression this test exists to catch — execSync would return
        // normally, the catch would never run, and the test would pass having
        // checked nothing. An 800-line file is over the 750 limit; exiting non-zero
        // is half the claim and belongs in an assertion.
        const outcome = ((): { failed: boolean; output: string } => {
            try {
                execSync(`node ${scriptPath} ${tempTestDir}`, { encoding: 'utf8' });
                return { failed: false, output: '' };
            } catch (error) {
                const e = error as { stdout?: string; stderr?: string };
                return { failed: true, output: e.stdout || e.stderr || '' };
            }
        })();

        // Assert
        expect(outcome.failed).toBe(true);
        expect(outcome.output).toContain('tests/subdir/test.test.ts');
    });
});
