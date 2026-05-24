/**
 * AI Context Writer Tests
 *
 * Tests for AGENTS.md generation from project data and the writer that lands
 * AGENTS.md plus CLAUDE.md pointer files in the project.
 *
 * Covers EDS projects, headless projects, block libraries, and conditional sections.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { generateAgentsMd, writeAgentsMd } from '@/features/project-creation/services/aiContextWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { Stack } from '@/types/stacks';
import type { InstalledBlockLibrary, CustomBlockLibrary } from '@/types/blockLibraries';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'eds-paas',
        name: 'Edge Delivery + PaaS',
        description: 'EDS storefront with Commerce Drop-ins and PaaS',
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        dependencies: [],
        ...overrides,
    };
}

function makeEdsStorefrontInstance(metaOverrides: Record<string, unknown> = {}): ComponentInstance {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        status: 'ready',
        path: '/projects/test-project/components/eds-storefront',
        metadata: {
            githubRepo: 'owner/my-repo',
            liveUrl: 'https://main--my-repo--owner.aem.live',
            previewUrl: 'https://main--my-repo--owner.aem.page',
            daLiveOrg: 'my-org',
            daLiveSite: 'my-site',
            ...metaOverrides,
        },
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
        selectedPackage: 'isle5',
        componentInstances: {
            'eds-storefront': makeEdsStorefrontInstance(),
        },
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
        selectedPackage: 'citisignal',
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

const STACKS: Stack[] = [
    makeStack({ id: 'eds-paas', name: 'Edge Delivery + PaaS' }),
    makeStack({ id: 'headless-paas', name: 'Headless + PaaS', frontend: 'headless', backend: 'adobe-commerce-paas' }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aiContextWriter', () => {
    describe('generateAgentsMd', () => {
        describe('EDS projects', () => {
            it('includes the GitHub repo URL', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('https://github.com/owner/my-repo');
            });

            it('includes the AEM live URL', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('https://main--my-repo--owner.aem.live');
            });

            it('includes the AEM preview URL', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('https://main--my-repo--owner.aem.page');
            });

            it('includes the DA.live authoring URL', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                // # is escaped by escapeMarkdown at the output boundary
                expect(result).toContain('https://da.live/\\#/my-org/my-site');
            });

            it('includes the local storefront path', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('/projects/test-project/components/eds-storefront');
            });
        });

        describe('headless projects', () => {
            it('includes the Commerce endpoint URL', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('https://commerce.example.com');
            });

            it('does not include DA.live URL', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('da.live');
            });

            it('does not include GitHub repo URL', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('github.com/owner/my-repo');
            });

            it('does not include AEM URLs', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('.aem.live');
                expect(result).not.toContain('.aem.page');
            });
        });

        describe('mesh endpoint', () => {
            it('includes the mesh endpoint URL when present', () => {
                const project = makeHeadlessProject({
                    meshState: {
                        endpoint: 'https://graph.adobe.io/api/mesh/abc123',
                        envVars: {},
                        sourceHash: null,
                        lastDeployed: new Date().toISOString(),
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('https://graph.adobe.io/api/mesh/abc123');
            });

            it('omits the mesh section when no mesh endpoint', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('graph.adobe.io');
            });
        });

        describe('package name', () => {
            it('includes the package display name for isle5', () => {
                const project = makeEdsProject({ selectedPackage: 'isle5' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('Isle5');
            });

            it('includes the package display name for citisignal', () => {
                const project = makeHeadlessProject({ selectedPackage: 'citisignal' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('CitiSignal');
            });
        });

        describe('block libraries', () => {
            it('lists installed block libraries with name, source URL, and block IDs', () => {
                const installedLibraries: InstalledBlockLibrary[] = [
                    {
                        name: 'Isle5 Block Collection',
                        source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                        commitSha: 'abc123',
                        blockIds: ['hero', 'carousel', 'newsletter'],
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                ];
                const project = makeEdsProject({ installedBlockLibraries: installedLibraries });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('Isle5 Block Collection');
                expect(result).toContain('https://github.com/stephen-garner-adobe/isle5');
                expect(result).toContain('hero');
                expect(result).toContain('carousel');
            });

            it('labels custom block libraries as custom', () => {
                const customLibs: CustomBlockLibrary[] = [
                    {
                        name: 'My Custom Blocks',
                        source: { owner: 'org', repo: 'my-blocks', branch: 'main' },
                    },
                ];
                const installedLibraries: InstalledBlockLibrary[] = [
                    {
                        name: 'My Custom Blocks',
                        source: { owner: 'org', repo: 'my-blocks', branch: 'main' },
                        commitSha: 'def456',
                        blockIds: ['my-hero'],
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                ];
                const project = makeEdsProject({
                    customBlockLibraries: customLibs,
                    installedBlockLibraries: installedLibraries,
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('custom');
                expect(result).toContain('My Custom Blocks');
            });

            it('does not include Block Libraries section for headless projects', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('Block Libraries');
            });

            it('does not include Block Libraries section when no libraries installed', () => {
                const project = makeEdsProject({ installedBlockLibraries: [] });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('Block Libraries');
            });

            it('marks block libraries as read-only sources', () => {
                const installedLibraries: InstalledBlockLibrary[] = [
                    {
                        name: 'Isle5 Block Collection',
                        source: { owner: 'stephen-garner-adobe', repo: 'isle5', branch: 'main' },
                        commitSha: 'abc123',
                        blockIds: ['hero'],
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                ];
                const project = makeEdsProject({ installedBlockLibraries: installedLibraries });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toMatch(/read-only sources/i);
                expect(result).toMatch(/library promotion is a planned future/i);
            });
        });

        describe('component repositories', () => {
            it('lists every component instance that has a githubRepo', () => {
                const project = makeEdsProject({
                    componentInstances: {
                        'eds-storefront': makeEdsStorefrontInstance(),
                        'commerce-mesh': {
                            id: 'commerce-mesh',
                            name: 'Commerce Mesh',
                            status: 'ready',
                            path: '/projects/test-project/components/commerce-mesh',
                            metadata: { githubRepo: 'owner/mesh-repo' },
                        },
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('## Component Repositories');
                expect(result).toContain('eds-storefront');
                expect(result).toContain('https://github.com/owner/my-repo');
                expect(result).toContain('commerce-mesh');
                expect(result).toContain('https://github.com/owner/mesh-repo');
            });

            it('skips components without a githubRepo (e.g., local-only deps)', () => {
                const project = makeEdsProject({
                    componentInstances: {
                        'eds-storefront': makeEdsStorefrontInstance(),
                        'local-tool': {
                            id: 'local-tool',
                            name: 'Local Tool',
                            status: 'ready',
                            path: '/projects/test-project/components/local-tool',
                            metadata: {},
                        },
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('## Component Repositories');
                // Component with no githubRepo should not appear in the listing
                expect(result).not.toMatch(/^- `local-tool`:/m);
            });

            it('omits the Component Repositories section when no component has a githubRepo', () => {
                const project = makeEdsProject({
                    componentInstances: {
                        'local-only': {
                            id: 'local-only',
                            name: 'Local Only',
                            status: 'ready',
                            path: '/projects/test-project/components/local-only',
                            metadata: {},
                        },
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## Component Repositories');
            });

            it('sanitizes the githubRepo slug to prevent Markdown injection', () => {
                const project = makeEdsProject({
                    componentInstances: {
                        'eds-storefront': makeEdsStorefrontInstance({
                            githubRepo: 'evil\nhttps://attacker.example.com](evil owner/evil-repo',
                        }),
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## attacker');
                expect(result).not.toContain('](evil');
            });
        });

        describe('sanitization', () => {
            it('strips newlines and # from project name to prevent heading injection', () => {
                const project = makeEdsProject({ name: 'my-project\n## Injected heading' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## Injected heading');
                expect(result).toContain('my-project');
            });

            it('strips newlines from Commerce URL to prevent Markdown heading injection', () => {
                const project = makeHeadlessProject({
                    commerce: {
                        type: 'platform-as-a-service',
                        instance: {
                            url: 'https://commerce.example.com\n## Injected Heading',
                            environmentId: 'env-123',
                            storeView: 'default',
                            websiteCode: 'base',
                            storeCode: 'main_website_store',
                        },
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                // Newline is removed, so ## cannot start a new Markdown heading line
                expect(result).not.toContain('\n## Injected Heading');
                expect(result).toContain('https://commerce.example.com');
            });

            it('replaces non-https Commerce URL with [invalid URL] placeholder', () => {
                const project = makeHeadlessProject({
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
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('javascript:');
                // Brackets escaped by escapeMarkdown
                expect(result).toContain('\\[invalid URL\\]');
            });

            it('preserves # in DA.live URL (fragment separator, escaped at output boundary)', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                // sanitizeUrl preserves # (valid fragment separator), escapeMarkdown then escapes it
                expect(result).toContain('https://da.live/\\#/my-org/my-site');
            });

            it('strips # from adobe organization field to prevent heading injection', () => {
                const project = makeEdsProject({
                    adobe: {
                        organization: 'My Org\n## Injected',
                        projectTitle: 'My Project',
                    },
                });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## Injected');
                expect(result).toContain('My Org');
            });

            it('falls back to raw packageId when package not found and sanitizes it', () => {
                const project = makeEdsProject({ selectedPackage: 'unknown\n## pkg-inject' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## pkg-inject');
            });

            it('falls back to raw stackId when stack not found and sanitizes it', () => {
                const project = makeEdsProject({ selectedStack: 'unknown\n## stack-inject' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).not.toContain('## stack-inject');
            });

            it('strips ]() from Commerce URL to prevent Markdown link injection via crafted https:// URLs', () => {
                const project = makeHeadlessProject({
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
                const result = generateAgentsMd(project, STACKS);

                // The ]( sequence that would break Markdown link syntax is stripped
                expect(result).not.toContain('](https://attacker.com');
                // The https:// base is preserved
                expect(result).toContain('https://example.com');
            });

            it('strips Markdown link-breaking chars from GitHub owner/repo in block libraries', () => {
                const installedLibraries = [
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
                const project = makeEdsProject({ installedBlockLibraries: installedLibraries });
                const result = generateAgentsMd(project, STACKS);

                // The ]( sequence enabling Markdown link injection is stripped; domain text may remain as plain text
                expect(result).not.toContain('](https://');
            });
        });

        describe('structure', () => {
            it('includes project name as heading', () => {
                const project = makeEdsProject({ name: 'my-demo' });
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('my-demo');
            });

            it('includes the stack name', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                // + is escaped by escapeMarkdown at the output boundary
                expect(result).toContain('Edge Delivery \\+ PaaS');
            });

            it('includes Try asking Claude section for EDS projects', () => {
                const project = makeEdsProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('Try asking Claude');
            });

            it('includes Try asking Claude section for headless projects', () => {
                const project = makeHeadlessProject();
                const result = generateAgentsMd(project, STACKS);

                expect(result).toContain('Try asking Claude');
            });
        });
    });

    describe('writeAgentsMd', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        function captureWritten(filePath: string): string {
            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const call = writeFileMock.mock.calls.find(
                ([p]: [string]) => p === filePath,
            );
            if (!call) {
                throw new Error(`No writeFile call found for path: ${filePath}`);
            }
            return call[1] as string;
        }

        it('writes AGENTS.md at the project root with the generated content', async () => {
            const project = makeEdsProject();
            await writeAgentsMd('/projects/test-project', project, STACKS);

            const content = captureWritten(path.join('/projects/test-project', 'AGENTS.md'));
            expect(content).toContain('Demo Builder Project: test-project');
            expect(content).toContain('Project Overview');
        });

        it('writes a CLAUDE.md pointer at the project root', async () => {
            const project = makeEdsProject();
            await writeAgentsMd('/projects/test-project', project, STACKS);

            const content = captureWritten(path.join('/projects/test-project', 'CLAUDE.md'));
            expect(content.trim()).toBe('see @AGENTS.md');
        });

        it('writes a .claude/CLAUDE.md pointer', async () => {
            const project = makeEdsProject();
            await writeAgentsMd('/projects/test-project', project, STACKS);

            const content = captureWritten(path.join('/projects/test-project', '.claude', 'CLAUDE.md'));
            expect(content.trim()).toBe('see @AGENTS.md');
        });

        it('creates the .claude directory before writing the pointer', async () => {
            const project = makeEdsProject();
            await writeAgentsMd('/projects/test-project', project, STACKS);

            const mkdirMock = fsPromises.mkdir as jest.Mock;
            const claudeDir = path.join('/projects/test-project', '.claude');
            const mkdirCall = mkdirMock.mock.calls.find(
                ([dir]: [string]) => dir === claudeDir,
            );
            expect(mkdirCall).toBeDefined();
        });

        it('writes AGENTS.md content identical to generateAgentsMd output', async () => {
            const project = makeEdsProject();
            const generated = generateAgentsMd(project, STACKS);

            await writeAgentsMd('/projects/test-project', project, STACKS);

            const content = captureWritten(path.join('/projects/test-project', 'AGENTS.md'));
            expect(content).toBe(generated);
        });
    });
});
