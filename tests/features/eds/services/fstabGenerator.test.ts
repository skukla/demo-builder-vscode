/**
 * Tests for fstabGenerator - Single source of truth for fstab.yaml generation
 */

import { generateFstabContent, FstabConfig } from '@/features/eds/services/fstabGenerator';

describe('fstabGenerator', () => {
    describe('generateFstabContent', () => {
        it('should generate valid fstab.yaml content with mountpoints and folders', () => {
            const config: FstabConfig = {
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
            };

            const content = generateFstabContent(config);

            // Verify mountpoints section
            expect(content).toContain('mountpoints:');
            expect(content).toContain('url: https://content.da.live/my-org/my-site/');
            expect(content).toContain('type: markup');

            // Verify folders section (critical for PDP routing)
            expect(content).toContain('folders:');
            expect(content).toContain('/products/: /products/default');
        });

        it('should use the correct DA.live URL format', () => {
            const config: FstabConfig = {
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
            };

            const content = generateFstabContent(config);

            expect(content).toContain('https://content.da.live/test-org/test-site/');
        });

        it('should handle special characters in org and site names', () => {
            const config: FstabConfig = {
                daLiveOrg: 'org-with-dashes',
                daLiveSite: 'site_with_underscores',
            };

            const content = generateFstabContent(config);

            expect(content).toContain('https://content.da.live/org-with-dashes/site_with_underscores/');
        });

        it('should produce valid YAML structure', () => {
            const config: FstabConfig = {
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
            };

            const content = generateFstabContent(config);

            // Check YAML structure (indentation matters)
            const lines = content.split('\n');

            // mountpoints is root level
            expect(lines[0]).toBe('mountpoints:');

            // / is indented under mountpoints
            expect(lines[1]).toMatch(/^\s{2}\/:/);

            // url and type are indented under /
            expect(lines[2]).toMatch(/^\s{4}url:/);
            expect(lines[3]).toMatch(/^\s{4}type:/);

            // folders is root level
            expect(content).toMatch(/^folders:/m);
        });

        it('should include trailing slash in DA.live URL', () => {
            const config: FstabConfig = {
                daLiveOrg: 'org',
                daLiveSite: 'site',
            };

            const content = generateFstabContent(config);

            // URL should end with trailing slash
            expect(content).toContain('https://content.da.live/org/site/');
        });
    });
});
