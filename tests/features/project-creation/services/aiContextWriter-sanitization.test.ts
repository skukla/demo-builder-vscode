/**
 * aiContextWriter — the sanitization rules.
 *
 * Split out 2026-08-06 to bring the parent under the 500-line limit. This group is
 * self-contained: it asserts that every interpolated project value is escaped before
 * it reaches AGENTS.md, which is the security-relevant half and reads better as its
 * own file than buried at line 469 of a 700-line suite.
 */
/**
 * AI Context Writer Tests
 *
 * Tests for AGENTS.md generation from project data and the writer that lands
 * AGENTS.md plus CLAUDE.md pointer files in the project.
 *
 * Covers EDS projects, headless projects, block libraries, and conditional sections.
 */

import { generateAgentsMd } from '@/features/project-creation/services/aiContextWriter';
import type { Project, ComponentInstance } from '@/types/base';
import type { Stack } from '@/types/stacks';

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
    });
});
