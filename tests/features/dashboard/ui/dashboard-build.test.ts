/**
 * Dashboard Bundle Build Integration Test
 *
 * Verifies that the dashboard-bundle.js builds successfully from the new location.
 * This is an integration test that runs webpack build and checks output.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Dashboard Bundle Build', () => {
    const projectRoot = path.resolve(__dirname, '../../../../');
    const bundlePath = path.join(projectRoot, 'dist', 'webview', 'dashboard-bundle.js');

    beforeAll(() => {
        // Clean dist directory
        const distPath = path.join(projectRoot, 'dist', 'webview');
        if (fs.existsSync(distPath)) {
            fs.rmSync(distPath, { recursive: true, force: true });
        }
    });

    it('should build dashboard-bundle.js without errors', () => {
        // Build webpack
        expect(() => {
            execSync('npm run compile:webview', {
                cwd: projectRoot,
                stdio: 'pipe',
                encoding: 'utf-8',
            });
        }).not.toThrow();
    }, 60000); // 60 second timeout for build

    it('should generate dashboard-bundle.js file', () => {
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
        const dashboardStats = fs.statSync(bundlePath);
        const vendorsPath = path.join(projectRoot, 'dist', 'webview', 'vendors-bundle.js');
        const vendorsStats = fs.statSync(vendorsPath);

        // Dashboard bundle should be smaller than vendors (shared code extracted)
        expect(dashboardStats.size).toBeLessThan(vendorsStats.size);
    });
});
