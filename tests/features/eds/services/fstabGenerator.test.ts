/**
 * Tests for fstabGenerator - Single source of truth for fstab.yaml generation
 */

import { generateFstabContent, FstabConfig } from '@/features/eds/services/fstabGenerator';

describe('fstabGenerator', () => {
    describe('generateFstabContent', () => {
        it('should generate valid fstab.yaml content with mountpoints', () => {
            const config: FstabConfig = {
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
            };

            const content = generateFstabContent(config);

            // Verify mountpoints section with simple DA.live URL format
            expect(content).toContain('mountpoints:');
            expect(content).toContain('https://content.da.live/my-org/my-site/');

            // Must NOT use nested BYOM format — that causes "invalid fstab" in da.live editor
            expect(content).not.toContain('type: markup');
            expect(content).not.toContain('url:');

            // Folder mapping is handled by Configuration Service API, not fstab.yaml
            expect(content).not.toContain('folders:');
        });

        it('should use the simple string format (not nested object format)', () => {
            const config: FstabConfig = {
                daLiveOrg: 'my-org',
                daLiveSite: 'my-site',
            };

            const content = generateFstabContent(config);

            // Simple format: "/: https://..." on a single line
            expect(content).toMatch(/\/:\s+https:\/\/content\.da\.live\/my-org\/my-site\//);
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

            const lines = content.split('\n');

            // mountpoints is root level
            expect(lines[0]).toBe('mountpoints:');

            // /: URL is indented under mountpoints (simple string format)
            expect(lines[1]).toMatch(/^\s{2}\/:\s+https:\/\//);
        });

        it('should include trailing slash in DA.live URL', () => {
            const config: FstabConfig = {
                daLiveOrg: 'org',
                daLiveSite: 'site',
            };

            const content = generateFstabContent(config);

            expect(content).toContain('https://content.da.live/org/site/');
        });
    });

    describe('input validation', () => {
        it('should throw when daLiveOrg contains a newline', () => {
            expect(() => generateFstabContent({ daLiveOrg: 'org\nredir:', daLiveSite: 'site' }))
                .toThrow('daLiveOrg');
        });

        it('should throw when daLiveSite contains a newline', () => {
            expect(() => generateFstabContent({ daLiveOrg: 'org', daLiveSite: 'site\nattack:' }))
                .toThrow('daLiveSite');
        });

        it('should throw when daLiveOrg contains a space', () => {
            expect(() => generateFstabContent({ daLiveOrg: 'my org', daLiveSite: 'site' }))
                .toThrow('daLiveOrg');
        });

        it('should throw when daLiveSite contains a colon', () => {
            expect(() => generateFstabContent({ daLiveOrg: 'org', daLiveSite: 'site:bad' }))
                .toThrow('daLiveSite');
        });

        it('should accept valid org and site names with dashes and underscores', () => {
            expect(() => generateFstabContent({ daLiveOrg: 'my-org', daLiveSite: 'my_site' }))
                .not.toThrow();
        });
    });
});
