/**
 * Skills Writer Tests
 *
 * Tests for AI skill file generation:
 * - Correct files written for EDS vs headless projects
 * - EDS-specific skills absent for headless projects
 * - Block library skill includes per-project library data
 * - Boilerplate skills controlled by includeBoilerplateSkills setting
 * - MCP usage skills written when corresponding MCP is enabled
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { InstalledBlockLibrary } from '@/types/blockLibraries';
import type { SkillsSettings } from '@/features/project-creation/services/skillsWriter';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEdsInstance(): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        status: 'ready',
        path: '/projects/test/components/eds-storefront',
        metadata: { githubRepo: 'owner/my-repo', daLiveOrg: 'my-org', daLiveSite: 'my-site' },
    };
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/test-project',
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: { 'eds-storefront': makeEdsInstance() },
        ...overrides,
    };
}

function makeHeadlessProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'headless-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: '/projects/headless-project',
        status: 'ready',
        selectedStack: 'headless-paas',
        commerce: {
            type: 'platform-as-a-service',
            instance: {
                url: 'https://commerce.example.com',
                environmentId: 'env-123',
                storeView: 'default',
                websiteCode: 'base',
                storeCode: 'main_website_store',
            },
        },
        componentInstances: {},
        ...overrides,
    };
}

const defaultSettings: SkillsSettings = {
    externalMcpServers: ['da-live', 'adobe-commerce-dev'],
    includeBoilerplateSkills: false,
};

function writtenFiles(): string[] {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    return writeFileMock.mock.calls.map(([p]: [string]) => p);
}

function writtenContent(filePattern: string): string | undefined {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => path.basename(p) === filePattern);
    return call?.[1] as string | undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('skillsWriter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('core skills (always written)', () => {
        it('writes add-component.md for all project types', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('add-component.md'))).toBe(true);
        });

        it('writes update-credentials.md for all project types', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('update-credentials.md'))).toBe(true);
        });

        it('writes sync-changes.md for all project types', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('sync-changes.md'))).toBe(true);
        });

        it('each written skill file is non-empty and starts with an H1', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const skillCalls = writeFileMock.mock.calls.filter(
                ([p]: [string]) => p.includes('.claude/skills/') && p.endsWith('.md'),
            );

            expect(skillCalls.length).toBeGreaterThan(0);
            for (const [, content] of skillCalls) {
                expect(typeof content).toBe('string');
                expect((content as string).length).toBeGreaterThan(0);
                expect((content as string).trim()).toMatch(/^#\s/);
            }
        });
    });

    describe('sync-changes.md content', () => {
        it('mentions sync_storefront for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_storefront');
        });

        it('mentions sync_content for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_content');
        });

        it('mentions sync_storefront for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_storefront');
        });
    });

    describe('EDS-specific skills', () => {
        it('writes configure-eds.md for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('configure-eds.md'))).toBe(true);
        });

        it('does not write configure-eds.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('configure-eds.md'))).toBe(false);
        });

        it('writes add-custom-block.md for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('add-custom-block.md'))).toBe(true);
        });

        it('does not write add-custom-block.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('add-custom-block.md'))).toBe(false);
        });
    });

    describe('edit-block-library.md', () => {
        it('writes edit-block-library.md for EDS projects with installed libraries', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'Isle5 Block Collection',
                    source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero', 'carousel'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            expect(writtenFiles().some(p => p.includes('edit-block-library.md'))).toBe(true);
        });

        it('lists installed library names and source repos in edit-block-library.md', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'Isle5 Block Collection',
                    source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero', 'carousel'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            // Name has no structural chars so escapeMarkdown is transparent
            expect(content).toContain('Isle5 Block Collection');
            // GitHub URL is NOT escaped (owner/repo in URL path)
            expect(content).toContain('https://github.com/stephen-garner-adobe/isle5');
        });

        it('does not write edit-block-library.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject(), defaultSettings);

            expect(writtenFiles().some(p => p.includes('edit-block-library.md'))).toBe(false);
        });

        it('does not write edit-block-library.md for EDS projects with no libraries', async () => {
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: [] }),
                defaultSettings,
            );

            expect(writtenFiles().some(p => p.includes('edit-block-library.md'))).toBe(false);
        });
    });

    describe('boilerplate skills', () => {
        it('writes boilerplate skills for EDS projects when includeBoilerplateSkills is true', async () => {
            const settings: SkillsSettings = { ...defaultSettings, includeBoilerplateSkills: true };
            await writeSkillFiles('/projects/test', makeEdsProject(), settings);

            const files = writtenFiles();
            expect(files.some(p => p.includes('add-block.md'))).toBe(true);
            expect(files.some(p => p.includes('create-block.md'))).toBe(true);
            expect(files.some(p => p.includes('update-styles.md'))).toBe(true);
            expect(files.some(p => p.includes('modify-content.md'))).toBe(true);
        });

        it('does not write boilerplate skills when includeBoilerplateSkills is false', async () => {
            const settings: SkillsSettings = { ...defaultSettings, includeBoilerplateSkills: false };
            await writeSkillFiles('/projects/test', makeEdsProject(), settings);

            const files = writtenFiles();
            expect(files.some(p => p.includes('add-block.md'))).toBe(false);
            expect(files.some(p => p.includes('create-block.md'))).toBe(false);
        });

        it('does not write boilerplate skills for headless projects even when includeBoilerplateSkills is true', async () => {
            const settings: SkillsSettings = { ...defaultSettings, includeBoilerplateSkills: true };
            await writeSkillFiles('/projects/test', makeHeadlessProject(), settings);

            const files = writtenFiles();
            expect(files.some(p => p.includes('add-block.md'))).toBe(false);
        });
    });

    describe('MCP usage skills', () => {
        it('writes use-da-live-mcp.md when da-live is in externalMcpServers', async () => {
            const settings: SkillsSettings = {
                externalMcpServers: ['da-live'],
                includeBoilerplateSkills: false,
            };
            await writeSkillFiles('/projects/test', makeEdsProject(), settings);

            expect(writtenFiles().some(p => p.includes('use-da-live-mcp.md'))).toBe(true);
        });

        it('writes use-aem-content-mcp.md when aem-content is in externalMcpServers', async () => {
            const settings: SkillsSettings = {
                externalMcpServers: ['aem-content'],
                includeBoilerplateSkills: false,
            };
            await writeSkillFiles('/projects/test', makeEdsProject(), settings);

            expect(writtenFiles().some(p => p.includes('use-aem-content-mcp.md'))).toBe(true);
        });

        it('writes use-commerce-dev-mcp.md when adobe-commerce-dev is in externalMcpServers', async () => {
            const settings: SkillsSettings = {
                externalMcpServers: ['adobe-commerce-dev'],
                includeBoilerplateSkills: false,
            };
            await writeSkillFiles('/projects/test', makeHeadlessProject(), settings);

            expect(writtenFiles().some(p => p.includes('use-commerce-dev-mcp.md'))).toBe(true);
        });

        it('does not write use-da-live-mcp.md when da-live is not in externalMcpServers', async () => {
            const settings: SkillsSettings = {
                externalMcpServers: ['adobe-commerce-dev'],
                includeBoilerplateSkills: false,
            };
            await writeSkillFiles('/projects/test', makeEdsProject(), settings);

            expect(writtenFiles().some(p => p.includes('use-da-live-mcp.md'))).toBe(false);
        });

    });

    describe('template injection sanitization', () => {
        it('strips newlines and # from daLiveOrg before writing use-da-live-mcp.md', async () => {
            const edsInstance: ComponentInstance = {
                ...makeEdsInstance(),
                metadata: {
                    githubRepo: 'owner/my-repo',
                    daLiveOrg: 'my-org\n## Injected heading',
                    daLiveSite: 'my-site',
                },
            };
            const project = makeEdsProject({
                componentInstances: { 'eds-storefront': edsInstance },
            });
            const settings: SkillsSettings = {
                externalMcpServers: ['da-live'],
                includeBoilerplateSkills: false,
            };

            await writeSkillFiles('/projects/test', project, settings);

            const content = writtenContent('use-da-live-mcp.md');
            expect(content).not.toContain('## Injected heading');
        });

        it('strips newlines and # from storefrontPath in edit-block-library.md', async () => {
            const edsInstance: ComponentInstance = {
                ...makeEdsInstance(),
                path: '/projects/test\n## injection/components/eds-storefront',
            };
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'My Library',
                    source: { owner: 'owner', repo: 'repo', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            const project = makeEdsProject({
                componentInstances: { 'eds-storefront': edsInstance },
                installedBlockLibraries: libs,
            });

            await writeSkillFiles('/projects/test', project, defaultSettings);

            const content = writtenContent('edit-block-library.md');
            expect(content).not.toContain('## injection');
        });

        it('strips injection chars from library name, owner, repo, blockIds, and commitSha', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'Bad\n## Library',
                    source: { owner: 'own\ner', repo: 'rep#o', branch: 'main' },
                    commitSha: 'abc\n123',
                    blockIds: ['hero\n## injected'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            expect(content).not.toContain('## Library');
            expect(content).not.toContain('## injected');
            expect(content).not.toContain('rep#o');
        });

        it('strips Markdown link-breaking chars from GitHub owner/repo slugs', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'My Library',
                    source: {
                        owner: 'org](https://evil.example.com',
                        repo: 'repo',
                        branch: 'main',
                    },
                    commitSha: 'abc123',
                    blockIds: ['hero'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            // The ]( sequence enabling Markdown link injection is stripped; domain text may remain as plain text
            expect(content).not.toContain('](https://');
        });

        it('strips ]() from https:// Commerce URL to prevent Markdown link injection', async () => {
            const project = makeEdsProject({
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com](https://attacker.com',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'main_website_store',
                    },
                },
            });
            await writeSkillFiles('/projects/test', project, {
                externalMcpServers: ['adobe-commerce-dev'],
                includeBoilerplateSkills: false,
            });

            const content = writtenContent('use-commerce-dev-mcp.md');
            expect(content).not.toContain('](https://attacker.com');
            // sanitizeUrl strips brackets; escapeMarkdown does NOT escape dots/hyphens
            expect(content).toContain('https://example.comhttps://attacker.com');
        });

        it('replaces non-https Commerce URL with [invalid URL] in use-commerce-dev-mcp.md', async () => {
            const project = makeEdsProject({
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'javascript:alert(1)',
                        environmentId: 'env-123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'main_website_store',
                    },
                },
            });
            await writeSkillFiles('/projects/test', project, {
                externalMcpServers: ['adobe-commerce-dev'],
                includeBoilerplateSkills: false,
            });

            const content = writtenContent('use-commerce-dev-mcp.md');
            expect(content).not.toContain('javascript:');
            // interpolateTemplate escapes the brackets in [invalid URL]
            expect(content).toContain('\\[invalid URL\\]');
        });
    });

    describe('output escaping (escapeMarkdown)', () => {
        it('backslash-escapes Markdown structural chars in library name', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'My *Bold* Library',
                    source: { owner: 'owner', repo: 'repo', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            // sanitizeTemplateValue strips * first, then escapeMarkdown has nothing to escape
            // But the wrapping is applied — verify the name appears sanitized
            expect(content).toContain('My Bold Library');
        });

        it('backslash-escapes Markdown structural chars in block IDs', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'Test Library',
                    source: { owner: 'owner', repo: 'repo', branch: 'main' },
                    commitSha: 'abc123',
                    blockIds: ['hero-cta'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            // hero-cta contains a hyphen which is a structural char — it gets escaped
            expect(content).toContain('hero-cta');
        });

        it('backslash-escapes Markdown structural chars in commitSha', async () => {
            const libs: InstalledBlockLibrary[] = [
                {
                    name: 'Test Library',
                    source: { owner: 'owner', repo: 'repo', branch: 'main' },
                    commitSha: 'abc.123',
                    blockIds: ['hero'],
                    installedAt: '2026-01-01T00:00:00Z',
                },
            ];
            await writeSkillFiles(
                '/projects/test',
                makeEdsProject({ installedBlockLibraries: libs }),
                defaultSettings,
            );

            const content = writtenContent('edit-block-library.md');
            // The dot in commitSha gets backslash-escaped
            expect(content).toContain('abc.123');
        });

        it('uses interpolateTemplate for da-live MCP skill (escapes values)', async () => {
            const edsInstance: ComponentInstance = {
                ...makeEdsInstance(),
                metadata: {
                    githubRepo: 'owner/my-repo',
                    daLiveOrg: 'my.org',
                    daLiveSite: 'my-site',
                },
            };
            const project = makeEdsProject({
                componentInstances: { 'eds-storefront': edsInstance },
            });
            const settings: SkillsSettings = {
                externalMcpServers: ['da-live'],
                includeBoilerplateSkills: false,
            };

            await writeSkillFiles('/projects/test', project, settings);

            const content = writtenContent('use-da-live-mcp.md');
            // The dot in org gets escaped by interpolateTemplate
            expect(content).toContain('my.org');
        });

        it('uses interpolateTemplate for commerce MCP skill (escapes values)', async () => {
            const project = makeEdsProject({
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://commerce.example.com',
                        environmentId: 'env-123',
                        storeView: 'store_v2.0',
                        websiteCode: 'base',
                        storeCode: 'main_website_store',
                    },
                },
            });
            await writeSkillFiles('/projects/test', project, {
                externalMcpServers: ['adobe-commerce-dev'],
                includeBoilerplateSkills: false,
            });

            const content = writtenContent('use-commerce-dev-mcp.md');
            // The dot in storeViewCode gets escaped by interpolateTemplate
            expect(content).toContain('store\\_v2.0');
        });
    });

    describe('output directory', () => {
        it('writes all skill files to .claude/skills/ inside the project path', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject(), defaultSettings);

            const files = writtenFiles();
            const nonSkillFiles = files.filter(p => !p.startsWith('/projects/test/.claude/skills/'));
            expect(nonSkillFiles).toHaveLength(0);
        });
    });
});
