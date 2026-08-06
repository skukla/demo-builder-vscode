/**
 * aiContextWriter — the writeAgentsMd half.
 *
 * Split from aiContextWriter.test.ts on 2026-08-06: the combined file counted 557
 * lines against the 500 limit. The seam is the module's two exported functions —
 * generateAgentsMd builds the string, writeAgentsMd puts it on disk — so each file
 * covers one. The preamble is duplicated rather than extracted to a testUtils:
 * it is imports and mocks, and both files read standalone this way.
 */
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


const STACKS: Stack[] = [
    makeStack({ id: 'eds-paas', name: 'Edge Delivery + PaaS' }),
    makeStack({ id: 'headless-paas', name: 'Headless + PaaS', frontend: 'headless', backend: 'adobe-commerce-paas' }),
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('aiContextWriter', () => {
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
