/**
 * Skills Writer Tests
 *
 * After the AI layer pivot, this writer emits only the Demo-Builder-specific
 * procedural skills (component/sync/credentials lifecycle plus create-project
 * orchestration). EDS storefront skills come from Adobe's official
 * `@adobe-commerce/commerce-extensibility-tools` package. MCP-usage skills are
 * no longer needed because external MCPs come from Claude Code's session-level
 * catalog.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { enoentError, makeTestWriter, mcpToolsManifest } from './generatedFileWriter.testUtils';
import {
    DEMO_BUILDER_SKILLS,
    writeSkillFiles,
} from '@/features/project-creation/services/skillsWriter';
import { DEMO_BUILDER_ALWAYS_ON_SKILLS } from '@/types/ai';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => ({
    lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    realpath: jest.fn(async (p: string) => p),
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn(),
    readFile: jest.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * writeSkillFiles through a fresh ADR-013 writer with no recorded hashes:
 * pre-ADR overwrite-once behavior, so every legacy content/count assertion
 * holds unchanged. Hash-and-skip routing is pinned in
 * skillsWriter.hashAndSkip.test.ts.
 */
function writeSkills(projectPath: string, project: Project): ReturnType<typeof writeSkillFiles> {
    return writeSkillFiles(projectPath, project, makeTestWriter(projectPath));
}

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

// ─── Adobe skill bundle mock helpers ─────────────────────────────────────────

const ADOBE_BUNDLE_RELATIVE =
    'node_modules/@adobe-commerce/commerce-extensibility-tools/dist/aem-boilerplate-commerce/skills';
const EDS_STOREFRONT_BUNDLE_PATH = `/projects/test/components/eds-storefront/${ADOBE_BUNDLE_RELATIVE}`;

function makeDirent(
    name: string,
    isDirectory: boolean
): { name: string; isDirectory: () => boolean } {
    return { name, isDirectory: () => isDirectory };
}

/**
 * Mock the Adobe skill bundle at `EDS_STOREFRONT_BUNDLE_PATH`.
 *
 * `skillFiles[skillName]` lists files inside that skill folder; the test then
 * intercepts readFile to return frontmatter for each `.md` file.
 */
function mockAdobeSkillBundle(skillFiles: Record<string, string[]>): void {
    const readdirMock = fsPromises.readdir as jest.Mock;
    const readFileMock = fsPromises.readFile as jest.Mock;

    readdirMock.mockImplementation(async (dirPath: string) => {
        if (dirPath === EDS_STOREFRONT_BUNDLE_PATH) {
            return Object.keys(skillFiles).map((name) => makeDirent(name, true));
        }
        // Skill folder contents
        const skillName = Object.keys(skillFiles).find(
            (name) => dirPath === path.join(EDS_STOREFRONT_BUNDLE_PATH, name)
        );
        if (skillName) {
            return skillFiles[skillName].map((filename) => makeDirent(filename, false));
        }
        throw enoentError();
    });

    readFileMock.mockImplementation(async (filePath: string) => {
        if (filePath.endsWith('.demo-builder-mcp/package.json')) {
            // Installed-tools manifest: playwright present, so the gated
            // skills stay deliverable and legacy count pins hold.
            return mcpToolsManifest(['@playwright/mcp']);
        }
        const filename = path.basename(filePath);
        const skillName = path.basename(path.dirname(filePath));
        if (filename.endsWith('.md')) {
            return `---\nname: ${skillName}\ndescription: Adobe skill ${skillName}\n---\n\n# ${skillName}\n\nBody for ${skillName}.\n`;
        }
        // Non-MD file
        return `content of ${filename}`;
    });
}

function mockMissingAdobeBundle(): void {
    const readdirMock = fsPromises.readdir as jest.Mock;
    readdirMock.mockImplementation(async () => {
        throw enoentError();
    });
}

describe('the always-on skill list has ONE home', () => {
    // The inspector that classifies skills for the AI Capabilities modal used to
    // keep its own copy of these filenames. It drifted: diagnose-demo.md was
    // added here and not there, so the modal filed it under "Custom" as though a
    // user had written it. Both sides now read the same constant — this pins that
    // the writer is still driven by it rather than by a second literal.
    it('writes exactly the canonical always-on set, in canonical order', () => {
        expect(DEMO_BUILDER_SKILLS.map((s) => s.filename)).toEqual([
            ...DEMO_BUILDER_ALWAYS_ON_SKILLS,
        ]);
    });

    it('pairs every canonical filename with non-empty content', () => {
        for (const { filename, content } of DEMO_BUILDER_SKILLS) {
            expect(typeof content).toBe('string');
            expect(content.length).toBeGreaterThan(0);
            expect(filename.endsWith('.md')).toBe(true);
        }
    });
});

describe('skillsWriter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: no Adobe bundle present. Individual tests can override.
        mockMissingAdobeBundle();
        // Default: nothing on disk — the ADR-013 writer's presence probe
        // ENOENTs, so every skill lands on the absent→write matrix row —
        // EXCEPT the installed-tools manifest, which declares playwright so
        // the gated skills stay deliverable and legacy count pins hold.
        (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
            if (p.endsWith('.demo-builder-mcp/package.json')) {
                return mcpToolsManifest(['@playwright/mcp']);
            }
            throw enoentError();
        });
    });

    describe('core skills (always written, all project types)', () => {
        it('writes add-component.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('add-component.md'))).toBe(true);
        });

        it('writes add-component.md for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('add-component.md'))).toBe(true);
        });

        it('writes sync-changes.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('sync-changes.md'))).toBe(true);
        });

        it('writes sync-changes.md for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('sync-changes.md'))).toBe(true);
        });

        it('writes update-credentials.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('update-credentials.md'))).toBe(true);
        });

        it('writes update-credentials.md for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('update-credentials.md'))).toBe(true);
        });

        it('writes create-eds-project.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('create-eds-project.md'))).toBe(true);
        });

        it('writes create-eds-project.md for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('create-eds-project.md'))).toBe(true);
        });

        it('writes exactly fourteen skill files for EDS projects when the Adobe skill bundle is not present', async () => {
            mockMissingAdobeBundle();
            await writeSkills('/projects/test', makeEdsProject());

            // 13 always-written Demo-Builder skills + extend-app-builder-app
            // (EDS satisfies projectNeedsAppBuilderTooling).
            // 12 → 13 always-on with diagnose-demo (AI_CONTEXT_VERSION 7).
            expect(writtenFiles()).toHaveLength(14);
        });

        it('writes scrape-reference-site.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('scrape-reference-site.md'))).toBe(true);
        });

        it('writes connect-authenticated-site.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('connect-authenticated-site.md'))).toBe(
                true
            );
        });

        it('writes commerce-block-mapper.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('commerce-block-mapper.md'))).toBe(true);
        });

        it('writes demo-data-injector.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('demo-data-injector.md'))).toBe(true);
        });

        it('writes header-nav-footer.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('header-nav-footer.md'))).toBe(true);
        });

        it('writes refine-visual-match.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('refine-visual-match.md'))).toBe(true);
        });

        it('writes register-custom-block.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('register-custom-block.md'))).toBe(true);
        });

        it('writes remove-custom-block.md for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('remove-custom-block.md'))).toBe(true);
        });

        it('each written skill file is non-empty and starts with YAML frontmatter or an H1', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const calls = writeFileMock.mock.calls;

            expect(calls.length).toBe(14);
            for (const [, content] of calls) {
                expect(typeof content).toBe('string');
                expect((content as string).length).toBeGreaterThan(0);
                // Demo Builder skills now ship with YAML frontmatter providing
                // name + description for the AI Configuration tab. Accept either
                // the frontmatter or a bare H1 (the historical shape).
                expect((content as string).trim()).toMatch(/^(---|#\s)/);
            }
        });

        it('each written skill has YAML frontmatter with name and description', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const calls = writeFileMock.mock.calls;

            for (const [, content] of calls) {
                const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content as string);
                expect(match).not.toBeNull();
                expect(match![1]).toMatch(/^name:\s+/m);
                expect(match![1]).toMatch(/^description:\s+/m);
            }
        });
    });

    describe('sync-changes.md content', () => {
        it('mentions sync_storefront', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_storefront');
        });
    });

    describe('extend-app-builder-app.md content (per-integration addressing)', () => {
        // Shell instancing: a project can hold N AI-built integrations, each
        // cloned into components/<id>/ with its own app.config.yaml and an
        // isolated OpenWhisk package. The skill must address integrations
        // per-instance, not assume a single custom app.
        it('states that a project can hold multiple AI-built integrations', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('extend-app-builder-app.md');
            expect(content).toMatch(/multiple AI-built integrations/i);
        });

        it('addresses each integration by its components/<id>/ folder', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('extend-app-builder-app.md');
            expect(content).toContain('components/<id>/');
            expect(content).toContain('app.config.yaml');
        });

        it('instructs the agent to confirm WHICH integration before editing', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('extend-app-builder-app.md');
            expect(content).toMatch(/which integration/i);
        });

        it('states that deploys are per-integration (own OpenWhisk package)', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('extend-app-builder-app.md');
            expect(content).toMatch(/per-integration/i);
            expect(content).toMatch(/OpenWhisk|I\/O Runtime/i);
        });

        it('no longer frames the target as a single blank shell app', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('extend-app-builder-app.md');
            expect(content).not.toMatch(/the blank shell/i);
        });
    });

    describe('create-eds-project.md org-context guidance', () => {
        it('explains per-operation org targeting and that ORG_MISMATCH is non-retryable', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project.md');
            // Shipped behavior: per-operation targeting, no shared global clobber.
            expect(content).toMatch(/per operation/i);
            expect(content).toContain('ORG_MISMATCH');
            expect(content).toMatch(/do not retry/i);
        });

        it('tells the agent to set its target before Adobe ops and to surface ORG_MISMATCH', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project.md');
            expect(content).toContain('select_org');
            expect(content).toContain('select_workspace');
        });

        it('no longer frames org context as a shared, process-wide setting', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project.md');
            expect(content).not.toMatch(/single, process-wide setting/i);
            expect(content).not.toMatch(/global and shared/i);
        });
    });

    describe('removed skills', () => {
        it('does not write add-block.md (Adobe extensibility tools provide this)', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('add-block.md'))).toBe(false);
        });

        it('does not write add-custom-block.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('add-custom-block.md'))).toBe(false);
        });

        it('does not write create-block.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('create-block.md'))).toBe(false);
        });

        it('does not write configure-eds.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('configure-eds.md'))).toBe(false);
        });

        it('does not write edit-block-library.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('edit-block-library.md'))).toBe(false);
        });

        it('does not write modify-content.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('modify-content.md'))).toBe(false);
        });

        it('does not write update-styles.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('update-styles.md'))).toBe(false);
        });

        it('does not write use-da-live-mcp.md (DA.live MCP comes from Claude Code session)', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('use-da-live-mcp.md'))).toBe(false);
        });

        it('does not write use-aem-content-mcp.md', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('use-aem-content-mcp.md'))).toBe(false);
        });

        it('does not write use-commerce-dev-mcp.md', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('use-commerce-dev-mcp.md'))).toBe(false);
        });
    });

    describe('output directory', () => {
        it('writes all skill files to .claude/skills/ inside the project path', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const files = writtenFiles();
            const nonSkillFiles = files.filter(
                (p) => !p.startsWith('/projects/test/.claude/skills/')
            );
            expect(nonSkillFiles).toHaveLength(0);
        });

        it('creates the .claude/skills directory before writing files', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const mkdirMock = fsPromises.mkdir as jest.Mock;
            const skillsDir = path.join('/projects/test', '.claude', 'skills');
            const mkdirCall = mkdirMock.mock.calls.find(([dir]: [string]) => dir === skillsDir);
            expect(mkdirCall).toBeDefined();
        });
    });

    describe('Adobe skill bundle copy', () => {
        it('copies each skill folder from the bundle to .claude/skills/<prefix>-<skill>/', async () => {
            mockAdobeSkillBundle({
                'block-developer': ['SKILL.md'],
                tester: ['SKILL.md'],
            });

            await writeSkills('/projects/test', makeEdsProject());

            const files = writtenFiles();
            expect(files).toEqual(
                expect.arrayContaining([
                    '/projects/test/.claude/skills/aem-block-developer/SKILL.md',
                    '/projects/test/.claude/skills/aem-tester/SKILL.md',
                ])
            );
        });

        it('rewrites the `name:` frontmatter field to match the prefixed folder name', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContentForPath(
                '/projects/test/.claude/skills/aem-block-developer/SKILL.md'
            );
            expect(content).toMatch(/^---\n[\s\S]*?\bname:\s*aem-block-developer\b[\s\S]*?\n---/);
            // The original `name: block-developer` is gone
            expect(content).not.toMatch(/^---\n[\s\S]*?\bname:\s*block-developer\s*$/m);
        });

        it('preserves the body of the SKILL.md after frontmatter rewrite', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContentForPath(
                '/projects/test/.claude/skills/aem-block-developer/SKILL.md'
            );
            expect(content).toContain('# block-developer');
            expect(content).toContain('Body for block-developer.');
        });

        it('copies non-markdown files verbatim (no frontmatter rewrite)', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md', 'helper.ts'] });

            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContentForPath(
                '/projects/test/.claude/skills/aem-block-developer/helper.ts'
            );
            expect(content).toBe('content of helper.ts');
        });

        it('does not copy Adobe skills for headless projects (no aiSkillBundle declared)', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeHeadlessProject());

            const files = writtenFiles();
            expect(files.some((p) => p.includes('/.claude/skills/aem-'))).toBe(false);
        });

        it('skips gracefully when the Adobe package is not yet installed (ENOENT)', async () => {
            mockMissingAdobeBundle();

            await expect(
                writeSkills('/projects/test', makeEdsProject())
            ).resolves.toMatchObject({
                written: expect.any(Array),
            });

            const files = writtenFiles();
            expect(files.some((p) => p.includes('/.claude/skills/aem-'))).toBe(false);
            // Demo-Builder skills still written: 3 lifecycle + create-eds-project +
            // diagnose-demo + 6 EDS-scraping + register-custom-block +
            // remove-custom-block = 13, plus extend-app-builder-app = 14.
            expect(
                files.filter((p) => p.startsWith('/projects/test/.claude/skills/'))
            ).toHaveLength(14);
        });

        it('still writes the three Demo-Builder lifecycle skills when copying the Adobe bundle', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeEdsProject());

            const files = writtenFiles();
            expect(files.some((p) => p.endsWith('add-component.md'))).toBe(true);
            expect(files.some((p) => p.endsWith('sync-changes.md'))).toBe(true);
            expect(files.some((p) => p.endsWith('update-credentials.md'))).toBe(true);
        });
    });

    describe('integration-starter-kit bundle (App Builder-adjacent projects)', () => {
        const TOOLS_ISK_PATH =
            '/projects/headless-project/.demo-builder-mcp/node_modules/@adobe-commerce/commerce-extensibility-tools/dist/integration-starter-kit/skills';

        function makeMeshProject(): Project {
            return makeHeadlessProject({
                componentInstances: {
                    'headless-commerce-mesh': {
                        id: 'headless-commerce-mesh',
                        name: 'Headless Commerce Mesh',
                        status: 'ready',
                        path: '/projects/headless-project/components/headless-commerce-mesh',
                    } as ComponentInstance,
                },
            });
        }

        function mockIskBundle(skillNames: string[]): void {
            const readdirMock = fsPromises.readdir as jest.Mock;
            const readFileMock = fsPromises.readFile as jest.Mock;
            readdirMock.mockImplementation(async (dirPath: string) => {
                if (dirPath === TOOLS_ISK_PATH) {
                    return skillNames.map((name) => makeDirent(name, true));
                }
                if (skillNames.some((name) => dirPath === path.join(TOOLS_ISK_PATH, name))) {
                    return [makeDirent('SKILL.md', false)];
                }
                throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            });
            readFileMock.mockImplementation(async (filePath: string) => {
                if (filePath.endsWith('.demo-builder-mcp/package.json')) {
                    return mcpToolsManifest(['@adobe-commerce/commerce-extensibility-tools']);
                }
                const skillName = path.basename(path.dirname(filePath));
                return `---\nname: ${skillName}\ndescription: ISK skill ${skillName}\n---\n\n# ${skillName}\n`;
            });
        }

        it('copies the integration-starter-kit skills (appbuilder- prefix) for a mesh project without a storefront', async () => {
            mockIskBundle(['architect', 'developer']);

            await writeSkills('/projects/headless-project', makeMeshProject());

            const files = writtenFiles();
            expect(files).toEqual(
                expect.arrayContaining([
                    '/projects/headless-project/.claude/skills/appbuilder-architect/SKILL.md',
                    '/projects/headless-project/.claude/skills/appbuilder-developer/SKILL.md',
                ])
            );
        });

        it('does NOT copy the integration-starter-kit skills for a bare project', async () => {
            mockIskBundle(['architect']);

            await writeSkills('/projects/headless-project', makeHeadlessProject());

            const files = writtenFiles();
            expect(files.some((p) => p.includes('/.claude/skills/appbuilder-'))).toBe(false);
        });

        it('skips gracefully when the tooling package is not installed (ENOENT)', async () => {
            mockMissingAdobeBundle();

            await expect(
                writeSkills('/projects/headless-project', makeMeshProject())
            ).resolves.toMatchObject({ written: expect.any(Array) });

            const files = writtenFiles();
            expect(files.some((p) => p.includes('/.claude/skills/appbuilder-'))).toBe(false);
        });
    });

    // ADR-013 hash-and-skip routing lives in its own suite:
    // skillsWriter.hashAndSkip.test.ts. Tool-availability gating AND the
    // `written` summary contract (now gating-shaped) live in
    // skillsWriter.toolGating.test.ts (this file is at the max-lines cap).
});

function writtenContentForPath(filePath: string): string | undefined {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => p === filePath);
    return call?.[1] as string | undefined;
}
