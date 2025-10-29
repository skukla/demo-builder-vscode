/**
 * Tests for npm performance flags in Adobe AIO CLI installation
 * Step 1: Quick Wins - npm Flags & Timeout Optimization
 */

import * as path from 'path';
import * as fs from 'fs/promises';

describe('npm Performance Flags', () => {
    let prerequisitesConfig: any;

    beforeAll(async () => {
        // Load prerequisites.json to verify npm flags
        const configPath = path.join(__dirname, '../../../templates/prerequisites.json');
        const content = await fs.readFile(configPath, 'utf-8');
        prerequisitesConfig = JSON.parse(content);
    });

    describe('Adobe AIO CLI Installation Commands', () => {
        it('should NOT include --no-audit flag (security: enable vulnerability scanning)', () => {
            const aioCliPrereq = prerequisitesConfig.prerequisites.find(
                (p: any) => p.id === 'aio-cli'
            );

            expect(aioCliPrereq).toBeDefined();
            expect(aioCliPrereq.install).toBeDefined();
            expect(aioCliPrereq.install.steps).toBeDefined();
            expect(aioCliPrereq.install.steps.length).toBeGreaterThan(0);

            const installStep = aioCliPrereq.install.steps[0];
            const command = installStep.commands[0];

            // Security fix H-01: --no-audit removed to enable npm vulnerability scanning
            expect(command).not.toContain('--no-audit');
        });

        it('should include --no-fund flag in npm install command', () => {
            const aioCliPrereq = prerequisitesConfig.prerequisites.find(
                (p: any) => p.id === 'aio-cli'
            );

            const installStep = aioCliPrereq.install.steps[0];
            const command = installStep.commands[0];

            expect(command).toContain('--no-fund');
        });

        it('should include --prefer-offline flag in npm install command', () => {
            const aioCliPrereq = prerequisitesConfig.prerequisites.find(
                (p: any) => p.id === 'aio-cli'
            );

            const installStep = aioCliPrereq.install.steps[0];
            const command = installStep.commands[0];

            expect(command).toContain('--prefer-offline');
        });

        it('should maintain --verbose flag for progress tracking', () => {
            const aioCliPrereq = prerequisitesConfig.prerequisites.find(
                (p: any) => p.id === 'aio-cli'
            );

            const installStep = aioCliPrereq.install.steps[0];
            const command = installStep.commands[0];

            // Ensure verbose flag is still present for progress tracking
            expect(command).toContain('--verbose');
        });

        it('should have all performance flags in correct order', () => {
            const aioCliPrereq = prerequisitesConfig.prerequisites.find(
                (p: any) => p.id === 'aio-cli'
            );

            const installStep = aioCliPrereq.install.steps[0];
            const command = installStep.commands[0];

            // Verify the complete command structure (without --no-audit for security)
            expect(command).toMatch(/npm install -g @adobe\/aio-cli.*--no-fund.*--prefer-offline.*--verbose/);
        });
    });
});
