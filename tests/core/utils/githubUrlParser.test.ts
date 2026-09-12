import { parseGitHubUrl, parseStorefrontLink } from '@/core/utils/githubUrlParser';

describe('parseGitHubUrl', () => {
    describe('valid URLs', () => {
        it('should parse standard GitHub URL', () => {
            const result = parseGitHubUrl('https://github.com/owner/repo');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('should parse GitHub URL with .git suffix', () => {
            const result = parseGitHubUrl('https://github.com/owner/repo.git');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('should handle organization names with hyphens', () => {
            const result = parseGitHubUrl('https://github.com/demo-system-stores/accs-citisignal');
            expect(result).toEqual({ owner: 'demo-system-stores', repo: 'accs-citisignal' });
        });

        it('should handle repo names with special characters', () => {
            const result = parseGitHubUrl('https://github.com/user/my-repo_v2');
            expect(result).toEqual({ owner: 'user', repo: 'my-repo_v2' });
        });

        it('should strip .git only at the END of the repo name', () => {
            // `.github` is a real repo in almost every org, and it CONTAINS `.git`.
            // An unanchored strip would turn it into `hub`.
            const result = parseGitHubUrl('https://github.com/demo-system-stores/.github');
            expect(result).toEqual({ owner: 'demo-system-stores', repo: '.github' });
        });

        it('should ignore trailing path segments', () => {
            const result = parseGitHubUrl('https://github.com/owner/repo/tree/main');
            expect(result).toEqual({ owner: 'owner', repo: 'repo' });
        });
    });

    describe('invalid inputs', () => {
        it('should return null for undefined', () => {
            expect(parseGitHubUrl(undefined)).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(parseGitHubUrl('')).toBeNull();
        });

        it('should return null for non-GitHub URL', () => {
            expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
        });

        it('should return null for invalid URL format', () => {
            expect(parseGitHubUrl('not-a-url')).toBeNull();
        });

        it('should return null for GitHub URL without repo', () => {
            expect(parseGitHubUrl('https://github.com/owner')).toBeNull();
        });

        it('should return null for GitHub root URL', () => {
            expect(parseGitHubUrl('https://github.com')).toBeNull();
        });

        it('should return null for GitHub URL with only trailing slash', () => {
            expect(parseGitHubUrl('https://github.com/')).toBeNull();
        });
    });
});

describe('parseStorefrontLink', () => {
    it('reads the repository out of an Edge Delivery site address', () => {
        expect(parseStorefrontLink('https://main--booth3-summit--vinodsivagnanam-pm.aem.live')).toEqual({
            owner: 'vinodsivagnanam-pm',
            repo: 'booth3-summit',
        });
        expect(parseStorefrontLink('https://main--isle5-demo--jen.aem.page/products/default')).toEqual({
            owner: 'jen',
            repo: 'isle5-demo',
        });
        expect(parseStorefrontLink('main--isle5-demo--jen.hlx.live')).toEqual({ owner: 'jen', repo: 'isle5-demo' });
    });

    it('reads a chat client\'s long dashes as the two hyphens they were', () => {
        expect(parseStorefrontLink('https://main\u2014booth3-summit\u2014vinodsivagnanam-pm.aem.live')).toEqual({
            owner: 'vinodsivagnanam-pm',
            repo: 'booth3-summit',
        });
    });

    it('still reads a GitHub link, and refuses everything else', () => {
        expect(parseStorefrontLink('https://github.com/jen/isle5-demo')).toEqual({ owner: 'jen', repo: 'isle5-demo' });
        expect(parseStorefrontLink('https://da.live/#/jen/isle5-demo')).toBeNull();
        expect(parseStorefrontLink('https://example.aem.live')).toBeNull();
        expect(parseStorefrontLink('https://--repo--owner.aem.live')).toBeNull();
        expect(parseStorefrontLink('not a link')).toBeNull();
        expect(parseStorefrontLink(undefined)).toBeNull();
    });
});
