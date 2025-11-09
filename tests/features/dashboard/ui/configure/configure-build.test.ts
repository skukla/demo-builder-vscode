/**
 * Configure Bundle Build Integration Test
 *
 * Verifies that the configure-bundle.js builds successfully from the new location.
 * This is an integration test that runs webpack build and checks output.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Configure Bundle Build', () => {
    const projectRoot = path.resolve(__dirname, '../../../../../');
    const bundlePath = path.join(projectRoot, 'dist', 'webview', 'configure-bundle.js');

    beforeAll(() => {
        // Clean dist directory
        const distPath = path.join(projectRoot, 'dist', 'webview');
        if (fs.existsSync(distPath)) {
            fs.rmSync(distPath, { recursive: true, force: true });
        }

        // Build webpack before running tests
        // This ensures all tests have access to built bundles
        execSync('npm run compile:webview', {
            cwd: projectRoot,
            stdio: 'pipe',
            encoding: 'utf-8',
        });
    }, 60000); // 60 second timeout for beforeAll

    it('should build configure-bundle.js without errors', () => {
        // Build already completed in beforeAll
        // Just verify the bundle exists
        expect(fs.existsSync(bundlePath)).toBe(true);
    });

    it('should generate configure-bundle.js file', () => {
        expect(fs.existsSync(bundlePath)).toBe(true);
    });

    it('should have non-zero bundle size', () => {
        const stats = fs.statSync(bundlePath);
        expect(stats.size).toBeGreaterThan(0);
    });

    it('should generate vendors bundle (code splitting)', () => {
        const vendorsPath = path.join(projectRoot, 'dist', 'webview', 'vendors-bundle.js');
        expect(fs.existsSync(vendorsPath)).toBe(true);
    });

    it('should have vendors bundle with React/Spectrum code', () => {
        const vendorsPath = path.join(projectRoot, 'dist', 'webview', 'vendors-bundle.js');
        const vendorsContent = fs.readFileSync(vendorsPath, 'utf-8');

        // Check for React presence
        expect(vendorsContent).toContain('react');
    });

    it('should reduce bundle size with code splitting', () => {
        const configureStats = fs.statSync(bundlePath);
        const vendorsPath = path.join(projectRoot, 'dist', 'webview', 'vendors-bundle.js');
        const vendorsStats = fs.statSync(vendorsPath);

        // Configure bundle should be smaller than vendors (shared code extracted)
        expect(configureStats.size).toBeLessThan(vendorsStats.size);
    });
});
