/**
 * AI Context Writer Tests
 *
 * Tests for AGENTS.md generation from project data and the writer that lands
 * AGENTS.md plus CLAUDE.md pointer files in the project.
 *
 * Covers EDS projects, headless projects, block libraries, and conditional sections.
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { enoentError, makeTestWriter } from './generatedFileWriter.testUtils';
import {
    generateAgentsMd,
    writeAgentsMd,
} from '@/features/project-creation/services/aiContextWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { Stack } from '@/types/stacks';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
}));

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Prime the mocked fs: listed absolute paths exist; everything else ENOENTs. */
function primeDisk(files: Record<string, string>): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (absPath: string) => {
        if (absPath in files) return files[absPath];
        throw enoentError();
    });
}

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
    makeStack({
        id: 'headless-paas',
        name: 'Headless + PaaS',
        frontend: 'headless',
        backend: 'adobe-commerce-paas',
    }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aiContextWriter', () => {
    describe('generateAgentsMd', () => {
        // Every project this extension generates is an Adobe Commerce demo — EDS
        // delivery, storefront drop-ins, da.live authoring, App Builder. Wayfinder
        // is Adobe's own agent router across exactly those properties, so the
        // generated bundle points at it instead of us re-deriving that map per
        // project (or the agent guessing from training data).
        describe('documentation routing', () => {
            it('points agents at Wayfinder for Adobe documentation', () => {
                const result = generateAgentsMd(makeEdsProject(), STACKS);

                expect(result).toContain('## Finding Adobe Documentation');
                expect(result).toContain('adobe-commerce/wayfinder');
            });

            // The line makes a REMOTE document part of the agent's instructions.
            // Pinned to a commit so upstream cannot change what a generated project
            // tells its agent without us re-pinning; @main would be an unreviewed
            // instruction channel into every user's repo.
            it('pins the router to a commit SHA, never @main', () => {
                const result = generateAgentsMd(makeEdsProject(), STACKS);

                expect(result).toMatch(/wayfinder@[0-9a-f]{40}\//);
                expect(result).not.toContain('wayfinder@main');
            });

            it('is present for every project shape, not just EDS', () => {
                const bare = makeEdsProject({ componentInstances: {} });

                expect(generateAgentsMd(bare, STACKS)).toContain('## Finding Adobe Documentation');
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
                        projectId: 'p1',
                        projectName: 'proj',
                        workspace: 'Stage',
                        authenticated: true,
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

            it('includes the Adding Adobe API Access section for App Builder-adjacent projects', () => {
                // EDS storefront satisfies projectNeedsAppBuilderTooling.
                const result = generateAgentsMd(makeEdsProject(), STACKS);

                expect(result).toContain('## Adding Adobe API Access');
                expect(result).toContain('list_console_apis');
                expect(result).toContain('add_console_apis');
                expect(result).toContain('extend-app-builder-app');
            });

            it('omits the Adding Adobe API Access section for bare projects', () => {
                // No storefront, mesh, or app-builder component.
                const result = generateAgentsMd(makeHeadlessProject(), STACKS);

                expect(result).not.toContain('## Adding Adobe API Access');
            });

            it('includes the App Builder Integrations section for App Builder-adjacent projects', () => {
                // Shell instancing: N AI-built integrations, each under
                // components/<id>/ with its own app.config.yaml + isolated
                // OpenWhisk package. AGENTS.md must teach per-integration
                // addressing (same gate as the Console-API section).
                const result = generateAgentsMd(makeEdsProject(), STACKS);

                expect(result).toContain('## App Builder Integrations');
                expect(result).toMatch(/multiple AI-built/i);
                expect(result).toContain('components/<id>/');
                expect(result).toContain('app.config.yaml');
            });

            it('instructs the agent to confirm WHICH integration before editing, deploys per-integration', () => {
                const result = generateAgentsMd(makeEdsProject(), STACKS);

                expect(result).toMatch(/which integration/i);
                expect(result).toMatch(/per-integration/i);
            });

            it('omits the App Builder Integrations section for bare projects', () => {
                const result = generateAgentsMd(makeHeadlessProject(), STACKS);

                expect(result).not.toContain('## App Builder Integrations');
                expect(result).not.toContain('components/<id>/');
            });
        });
    });

    describe('writeAgentsMd', () => {
        const PROJECT_PATH = '/projects/test-project';

        beforeEach(() => {
            jest.clearAllMocks();
            primeDisk({});
        });

        function makeWriter(recorded: Record<string, string> = {}) {
            return makeTestWriter(PROJECT_PATH, recorded);
        }

        function captureWritten(filePath: string): string {
            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const call = writeFileMock.mock.calls.find(([p]: [string]) => p === filePath);
            if (!call) {
                throw new Error(`No writeFile call found for path: ${filePath}`);
            }
            return call[1] as string;
        }

        it('writes AGENTS.md at the project root with the generated content', async () => {
            const project = makeEdsProject();
            await writeAgentsMd(PROJECT_PATH, project, STACKS, makeWriter());

            const content = captureWritten(path.join(PROJECT_PATH, 'AGENTS.md'));
            expect(content).toContain('Demo Builder Project: test-project');
            expect(content).toContain('Project Overview');
        });

        it('writes a CLAUDE.md pointer at the project root', async () => {
            const project = makeEdsProject();
            await writeAgentsMd(PROJECT_PATH, project, STACKS, makeWriter());

            const content = captureWritten(path.join(PROJECT_PATH, 'CLAUDE.md'));
            expect(content.trim()).toBe('see @AGENTS.md');
        });

        it('writes a .claude/CLAUDE.md pointer', async () => {
            const project = makeEdsProject();
            await writeAgentsMd(PROJECT_PATH, project, STACKS, makeWriter());

            const content = captureWritten(path.join(PROJECT_PATH, '.claude', 'CLAUDE.md'));
            expect(content.trim()).toBe('see @AGENTS.md');
        });

        it('creates the .claude directory before writing the pointer', async () => {
            const project = makeEdsProject();
            await writeAgentsMd(PROJECT_PATH, project, STACKS, makeWriter());

            const mkdirMock = fsPromises.mkdir as jest.Mock;
            const claudeDir = path.join(PROJECT_PATH, '.claude');
            const mkdirCall = mkdirMock.mock.calls.find(([dir]: [string]) => dir === claudeDir);
            expect(mkdirCall).toBeDefined();
        });

        it('writes AGENTS.md content identical to generateAgentsMd output', async () => {
            const project = makeEdsProject();
            const generated = generateAgentsMd(project, STACKS);

            await writeAgentsMd(PROJECT_PATH, project, STACKS, makeWriter());

            const content = captureWritten(path.join(PROJECT_PATH, 'AGENTS.md'));
            expect(content).toBe(generated);
        });

        // ADR-013: every bundle file goes through the GeneratedFileWriter seam —
        // a write that bypasses it reverts that file to blind-overwrite behavior.
        describe('hash-and-skip routing (ADR-013)', () => {
            it('reports AGENTS.md and both pointers as written through the seam', async () => {
                const writer = makeWriter();

                await writeAgentsMd(PROJECT_PATH, makeEdsProject(), STACKS, writer);

                expect(writer.report().written).toEqual([
                    'AGENTS.md',
                    'CLAUDE.md',
                    '.claude/CLAUDE.md',
                ]);
            });

            it('records project-relative posix hash keys for all three files', async () => {
                const writer = makeWriter();

                await writeAgentsMd(PROJECT_PATH, makeEdsProject(), STACKS, writer);

                expect(Object.keys(writer.hashes()).sort()).toEqual([
                    '.claude/CLAUDE.md',
                    'AGENTS.md',
                    'CLAUDE.md',
                ]);
            });

            it('skips a user-edited AGENTS.md while the pointers still refresh', async () => {
                primeDisk({
                    [path.join(PROJECT_PATH, 'AGENTS.md')]: '# my own notes',
                });
                const writer = makeWriter({
                    'AGENTS.md': sha256('what we generated last time'),
                });

                await writeAgentsMd(PROJECT_PATH, makeEdsProject(), STACKS, writer);

                const writtenPaths = (fsPromises.writeFile as jest.Mock).mock.calls.map(
                    ([p]: [string]) => p
                );
                expect(writtenPaths).not.toContain(path.join(PROJECT_PATH, 'AGENTS.md'));
                expect(writtenPaths).toContain(path.join(PROJECT_PATH, 'CLAUDE.md'));
                expect(writtenPaths).toContain(path.join(PROJECT_PATH, '.claude', 'CLAUDE.md'));
                expect(writer.report().skipped).toEqual(['AGENTS.md']);
            });

            it('overwrites a pre-ADR AGENTS.md once when no hash is recorded', async () => {
                primeDisk({
                    [path.join(PROJECT_PATH, 'AGENTS.md')]: '# pre-ADR content, maybe edited',
                });
                const writer = makeWriter({});

                await writeAgentsMd(PROJECT_PATH, makeEdsProject(), STACKS, writer);

                expect(writer.report().written).toContain('AGENTS.md');
                expect(writer.report().skipped).toEqual([]);
            });
        });
    });
    describe('How to Change Things — the skills pointer', () => {
        it('names diagnose-demo as the FIRST thing to read when something is wrong', () => {
            // The skills directory used to be described only as "step-by-step guides
            // for each operation", which frames every skill as how-to-DO. An agent
            // reading that had no reason to think a diagnosis guide existed — the
            // exact gap diagnose-demo was written to close.
            const content = generateAgentsMd(makeEdsProject(), STACKS);

            expect(content).toContain('## How to Change Things');
            expect(content).toContain('`diagnose-demo`');
            expect(content).toMatch(/do not yet know why/i);
        });

        it('points at the skills directory for every project shape', () => {
            // Diagnosis is not EDS-specific: any project can break.
            for (const project of [makeEdsProject(), makeHeadlessProject()]) {
                const content = generateAgentsMd(project, STACKS);
                expect(content).toContain('.claude/skills/');
                expect(content).toContain('`diagnose-demo`');
            }
        });
    });
});
