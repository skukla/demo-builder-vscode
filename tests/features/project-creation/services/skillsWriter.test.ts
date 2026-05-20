/**
 * Skills Writer Tests
 *
 * After the AI layer pivot (Cycle A), this writer emits only three
 * Demo-Builder-specific procedural skills. EDS storefront skills come from
 * Adobe's official `@adobe-commerce/commerce-extensibility-tools` package
 * (installed via Cycle B). MCP-usage skills are no longer needed because
 * external MCPs come from Claude Code's session-level catalog.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project, ComponentInstance } from '@/types/base';

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

    describe('core skills (always written, all project types)', () => {
        it('writes add-component.md for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('add-component.md'))).toBe(true);
        });

        it('writes add-component.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some(p => p.endsWith('add-component.md'))).toBe(true);
        });

        it('writes sync-changes.md for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('sync-changes.md'))).toBe(true);
        });

        it('writes sync-changes.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some(p => p.endsWith('sync-changes.md'))).toBe(true);
        });

        it('writes update-credentials.md for EDS projects', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('update-credentials.md'))).toBe(true);
        });

        it('writes update-credentials.md for headless projects', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some(p => p.endsWith('update-credentials.md'))).toBe(true);
        });

        it('writes exactly three skill files', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles()).toHaveLength(3);
        });

        it('each written skill file is non-empty and starts with an H1', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const calls = writeFileMock.mock.calls;

            expect(calls.length).toBe(3);
            for (const [, content] of calls) {
                expect(typeof content).toBe('string');
                expect((content as string).length).toBeGreaterThan(0);
                expect((content as string).trim()).toMatch(/^#\s/);
            }
        });
    });

    describe('sync-changes.md content', () => {
        it('mentions sync_storefront', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_storefront');
        });
    });

    describe('removed skills (Cycle A trim)', () => {
        it('does not write add-block.md (Adobe extensibility tools provide this)', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('add-block.md'))).toBe(false);
        });

        it('does not write add-custom-block.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('add-custom-block.md'))).toBe(false);
        });

        it('does not write create-block.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('create-block.md'))).toBe(false);
        });

        it('does not write configure-eds.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('configure-eds.md'))).toBe(false);
        });

        it('does not write edit-block-library.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('edit-block-library.md'))).toBe(false);
        });

        it('does not write modify-content.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('modify-content.md'))).toBe(false);
        });

        it('does not write update-styles.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('update-styles.md'))).toBe(false);
        });

        it('does not write use-da-live-mcp.md (DA.live MCP comes from Claude Code session)', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('use-da-live-mcp.md'))).toBe(false);
        });

        it('does not write use-aem-content-mcp.md', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles().some(p => p.endsWith('use-aem-content-mcp.md'))).toBe(false);
        });

        it('does not write use-commerce-dev-mcp.md', async () => {
            await writeSkillFiles('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some(p => p.endsWith('use-commerce-dev-mcp.md'))).toBe(false);
        });
    });

    describe('output directory', () => {
        it('writes all skill files to .claude/skills/ inside the project path', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            const files = writtenFiles();
            const nonSkillFiles = files.filter(p => !p.startsWith('/projects/test/.claude/skills/'));
            expect(nonSkillFiles).toHaveLength(0);
        });

        it('creates the .claude/skills directory before writing files', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            const mkdirMock = fsPromises.mkdir as jest.Mock;
            const skillsDir = path.join('/projects/test', '.claude', 'skills');
            const mkdirCall = mkdirMock.mock.calls.find(
                ([dir]: [string]) => dir === skillsDir,
            );
            expect(mkdirCall).toBeDefined();
        });
    });
});
