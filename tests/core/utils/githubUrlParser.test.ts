import {
    assertGitHubName,
    assertGitRef,
    gitHubSourceProblem,
    parseGitHubUrl,
    parseStorefrontLink,
} from '@/core/utils/githubUrlParser';

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

describe('gitHubSourceProblem', () => {
    it('answers nothing for a usable owner and repo', () => {
        expect(gitHubSourceProblem('jen', 'isle5-demo.v2')).toBeUndefined();
    });

    it('names the owner when the owner is unusable, before looking at the repo', () => {
        expect(gitHubSourceProblem('jen smith', '..')).toBe('Invalid GitHub owner: "jen smith"');
    });

    it('names the repo when only the repo is unusable', () => {
        expect(gitHubSourceProblem('jen', '..')).toBe('Invalid GitHub repo: ".."');
    });
});

describe('parseStorefrontLink — what counts as a site address', () => {
    it('reads an address pasted with spaces around it', () => {
        expect(parseStorefrontLink('  main--isle5-demo--jen.aem.live  ')).toEqual({
            owner: 'jen',
            repo: 'isle5-demo',
        });
    });

    it('reads the shorter long dash the same way as the longer one', () => {
        expect(parseStorefrontLink('https://main\u2013isle5-demo\u2013jen.aem.page')).toEqual({
            owner: 'jen',
            repo: 'isle5-demo',
        });
    });

    it('reads the older hlx.page host', () => {
        expect(parseStorefrontLink('https://main--isle5-demo--jen.hlx.page')).toEqual({
            owner: 'jen',
            repo: 'isle5-demo',
        });
    });

    // The whole host has to be the site address: a look-alike that merely
    // CONTAINS one is somebody else's domain.
    it('refuses a host that only contains a site address', () => {
        expect(parseStorefrontLink('https://sub.main--isle5-demo--jen.aem.live')).toBeNull();
        expect(parseStorefrontLink('https://main--isle5-demo--jen.aem.live.example.com')).toBeNull();
    });

    it('refuses a host with too few or too many parts', () => {
        expect(parseStorefrontLink('https://isle5-demo--jen.aem.live')).toBeNull();
        expect(parseStorefrontLink('https://main--isle5-demo--jen--extra.aem.live')).toBeNull();
    });

    it('refuses a host with any part left empty, whichever one', () => {
        expect(parseStorefrontLink('https://main----jen.aem.live')).toBeNull();
        expect(parseStorefrontLink('main--isle5-demo--.aem.live')).toBeNull();
    });

    it('answers null for empty text and for text no address can be made from', () => {
        expect(parseStorefrontLink('')).toBeNull();
        expect(parseStorefrontLink('https://')).toBeNull();
    });
});

describe('assertGitHubName', () => {
    it('accepts letters, digits, dots, underscores and hyphens', () => {
        expect(() => assertGitHubName('Jen-smith_2.demo', 'owner')).not.toThrow();
    });

    it('refuses a name with a shell character at the start, the middle or the end', () => {
        expect(() => assertGitHubName(';rm', 'owner')).toThrow('Invalid GitHub owner: ";rm"');
        expect(() => assertGitHubName('a b', 'repo')).toThrow('Invalid GitHub repo: "a b"');
        expect(() => assertGitHubName('rm;', 'repo')).toThrow('Invalid GitHub repo: "rm;"');
    });

    it('refuses an empty name', () => {
        expect(() => assertGitHubName('', 'owner')).toThrow('Invalid GitHub owner: ""');
    });

    // Both pass the charset; as path segments they mean "here" and "up one".
    it('refuses the dot-only names', () => {
        expect(() => assertGitHubName('.', 'repo')).toThrow('Invalid GitHub repo: "."');
        expect(() => assertGitHubName('..', 'owner')).toThrow('Invalid GitHub owner: ".."');
    });
});

describe('assertGitRef', () => {
    it('accepts a branch name with slashes, dots, underscores and hyphens', () => {
        expect(() => assertGitRef('feature/isle5_demo-1.2')).not.toThrow();
    });

    it('refuses a ref with a shell character at the start, the middle or the end', () => {
        expect(() => assertGitRef(';main')).toThrow('Invalid git branch: ";main"');
        expect(() => assertGitRef('ma in')).toThrow('Invalid git branch: "ma in"');
        expect(() => assertGitRef('main;')).toThrow('Invalid git branch: "main;"');
    });

    it('refuses an empty ref', () => {
        expect(() => assertGitRef('')).toThrow('Invalid git branch: ""');
    });

    it('refuses a ref that climbs with two dots, though each character is allowed', () => {
        expect(() => assertGitRef('main/../other')).toThrow('Invalid git branch: "main/../other"');
    });
});
