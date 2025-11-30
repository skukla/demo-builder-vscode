/**
 * Tests for check-test-file-sizes CI/CD script
 *
 * Validates that the script correctly detects oversized test files
 * and enforces the 750-line maximum threshold.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

describe('check-test-file-sizes script', () => {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'check-test-file-sizes.js');
    const tempTestDir = path.join(__dirname, '__temp_test_files__');

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

        // Act & Assert: Should report relative path
        try {
            execSync(`node ${scriptPath} ${tempTestDir}`, { encoding: 'utf8' });
        } catch (error: any) {
            expect(error.stdout || error.stderr).toContain('tests/subdir/test.test.ts');
        }
    });
});
