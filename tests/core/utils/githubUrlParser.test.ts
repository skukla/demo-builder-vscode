import { parseGitHubUrl } from '@/core/utils/githubUrlParser';

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
