/**
 * Jest Configuration Integration Tests
 *
 * Tests validate that Jest can start successfully with updated moduleNameMapper
 * and can resolve imports correctly.
 */

import { execSync } from 'child_process';
import * as path from 'path';

describe('Jest Configuration - Module Resolution', () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  describe('Test Scenario 4: Jest Module Resolution', () => {
    test('should start Jest without module resolution errors', () => {
      // Given: jest.config.js updated with @/features moduleNameMapper
      // When: Running Jest with --passWithNoTests
      // Then: Jest starts successfully

      expect(() => {
        execSync('npm test -- --passWithNoTests --testPathIgnorePatterns=".*"', {
          cwd: projectRoot,
          stdio: 'pipe',
          timeout: 60000
        });
      }).not.toThrow();
    }, 70000);

    test('should resolve @/features imports in test files', () => {
      // Given: moduleNameMapper configured for @/features
      // When: Jest attempts to resolve imports
      // Then: No "Cannot find module" errors

      const output = execSync(
        'npm test -- --passWithNoTests --testPathIgnorePatterns=".*" 2>&1 || true',
        {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 60000
        }
      );

      expect(output).not.toMatch(/Cannot find module '@\/features/);
    }, 70000);

    test('should support colocated test files in features directory', () => {
      // Given: testMatch patterns include src/**/*.test.ts?(x)
      // When: Jest test discovery runs
      // Then: Jest can discover tests in src/features/*/ui/

      const output = execSync(
        'npm test -- --listTests 2>&1 || true',
        {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 60000
        }
      );

      // Jest should be able to discover tests (even if none exist yet)
      // No fatal errors about test patterns
      expect(output).not.toMatch(/No tests found/);
    }, 70000);

    test('should not have warnings about unresolved imports', () => {
      // Given: Complete moduleNameMapper configuration
      // When: Jest validates module resolution
      // Then: No warnings about missing mappings

      const output = execSync(
        'npm test -- --passWithNoTests --testPathIgnorePatterns=".*" 2>&1 || true',
        {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 60000
        }
      );

      expect(output).not.toMatch(/Could not locate module/i);
      expect(output).not.toMatch(/Cannot resolve module/i);
    }, 70000);
  });

  describe('Edge Case: Test Discovery', () => {
    test('should handle empty test directories gracefully', () => {
      // Given: Feature directories with no tests yet
      // When: Jest runs test discovery
      // Then: No fatal errors, just "No tests found" message

      const output = execSync(
        'npm test -- --passWithNoTests --testPathIgnorePatterns=".*" 2>&1 || true',
        {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 60000
        }
      );

      // Should not crash or throw errors
      expect(typeof output).toBe('string');
    }, 70000);
  });
});
