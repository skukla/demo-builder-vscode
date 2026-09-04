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

import { fsPromises } from './aiBundleFsMock';
import * as path from 'path';
import { makeEdsProject, makeHeadlessProject } from './aiBundleFixtures';
import { enoentError, makeTestWriter, mcpToolsManifest } from './generatedFileWriter.testUtils';
import {
    EDS_STOREFRONT_BUNDLE_PATH,
    makeDirent,
    mockAdobeSkillBundle,
    mockMissingAdobeBundle,
} from './skillsWriter.testUtils';
import {
    DEMO_BUILDER_SKILLS,
    writeSkillFiles,
} from '@/features/project-creation/services/aiBundle/skillsWriter';
import { DEMO_BUILDER_ALWAYS_ON_SKILLS } from '@/types/ai';
import type { Project, ComponentInstance } from '@/types/base';

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

/**
 * A project that actually BUILDS an App Builder app — here, a mesh. Since
 * AI-1o the integration-starter-kit bundle and `extend-app-builder-app` follow
 * this, not a bare EDS storefront.
 */
function makeAppBuilderProject(): Project {
    return makeEdsProject({
        componentInstances: {
            'headless-commerce-mesh': {
                id: 'headless-commerce-mesh',
                name: 'Headless Commerce Mesh',
                status: 'ready',
                path: '/projects/test/components/headless-commerce-mesh',
            } as ComponentInstance,
        },
    });
}

function writtenFiles(): string[] {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    return writeFileMock.mock.calls.map(([p]: [string]) => p);
}

function writtenContent(skillName: string): string | undefined {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) =>
        p.endsWith(path.join(skillName, 'SKILL.md')),
    );
    return call?.[1] as string | undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// ─── Adobe skill bundle mock helpers ─────────────────────────────────────────

describe('the always-on skill list has ONE home', () => {
    // The inspector that classifies skills for the AI Capabilities modal used to
    // keep its own copy of these filenames. It drifted: diagnose-demo.md was
    // added here and not there, so the modal filed it under "Custom" as though a
    // user had written it. Both sides now read the same constant — this pins that
    // the writer is still driven by it rather than by a second literal.
    it('writes exactly the canonical always-on set, in canonical order', () => {
        expect(DEMO_BUILDER_SKILLS.map((s) => s.name)).toEqual([
            ...DEMO_BUILDER_ALWAYS_ON_SKILLS,
        ]);
    });

    it('pairs every canonical name with non-empty content', () => {
        for (const { name, content } of DEMO_BUILDER_SKILLS) {
            expect(typeof content).toBe('string');
            expect(content.length).toBeGreaterThan(0);
            // Bare directory names since v27 — the .md suffix was the flat layout.
            expect(name.endsWith('.md')).toBe(false);
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
        it('writes add-component for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('add-component/SKILL.md'))).toBe(true);
        });

        it('writes add-component for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('add-component/SKILL.md'))).toBe(true);
        });

        it('writes sync-changes for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('sync-changes/SKILL.md'))).toBe(true);
        });

        it('writes sync-changes for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('sync-changes/SKILL.md'))).toBe(true);
        });

        it('writes update-credentials for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('update-credentials/SKILL.md'))).toBe(true);
        });

        it('writes update-credentials for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('update-credentials/SKILL.md'))).toBe(true);
        });

        it('writes create-eds-project for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('create-eds-project/SKILL.md'))).toBe(true);
        });

        it('writes create-eds-project for headless projects', async () => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith('create-eds-project/SKILL.md'))).toBe(true);
        });

        it('writes exactly fourteen skill files for EDS projects when the Adobe skill bundle is not present', async () => {
            mockMissingAdobeBundle();
            await writeSkills('/projects/test', makeEdsProject());

            // 14 always-written Demo-Builder skills. 15 → 14 on 2026-08-26
            // (AI-1o): extend-app-builder-app is App Builder work, and a
            // storefront with no mesh and no attached component is not doing it.
            expect(writtenFiles()).toHaveLength(14);
        });

        it('writes scrape-reference-site for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('scrape-reference-site/SKILL.md'))).toBe(true);
        });

        it('writes connect-authenticated-site for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('connect-authenticated-site/SKILL.md'))).toBe(
                true
            );
        });

        it('writes commerce-block-mapper for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('commerce-block-mapper/SKILL.md'))).toBe(true);
        });

        it('writes demo-data-injector for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('demo-data-injector/SKILL.md'))).toBe(true);
        });

        it('writes header-nav-footer for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('header-nav-footer/SKILL.md'))).toBe(true);
        });

        it('writes refine-visual-match for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('refine-visual-match/SKILL.md'))).toBe(true);
        });

        it('writes register-custom-block for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('register-custom-block/SKILL.md'))).toBe(true);
        });

        it('writes remove-custom-block for EDS projects', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith('remove-custom-block/SKILL.md'))).toBe(true);
        });

        it('each written skill file is non-empty and starts with YAML frontmatter or an H1', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const calls = writeFileMock.mock.calls;

            expect(calls).toHaveLength(14);
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

    describe('sync-changes content', () => {
        it('mentions sync_storefront', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('sync-changes');
            expect(content).toContain('sync_storefront');
        });
    });

    describe('extend-app-builder-app content (per-integration addressing)', () => {
        // Shell instancing: a project can hold N AI-built integrations, each
        // cloned into components/<id>/ with its own app.config.yaml and an
        // isolated OpenWhisk package. The skill must address integrations
        // per-instance, not assume a single custom app.
        it('states that a project can hold multiple AI-built integrations', async () => {
            await writeSkills('/projects/test', makeAppBuilderProject());

            const content = writtenContent('extend-app-builder-app');
            expect(content).toMatch(/multiple AI-built integrations/i);
        });

        it('addresses each integration by its components/<id>/ folder', async () => {
            await writeSkills('/projects/test', makeAppBuilderProject());

            const content = writtenContent('extend-app-builder-app');
            expect(content).toContain('components/<id>/');
            expect(content).toContain('app.config.yaml');
        });

        it('instructs the agent to confirm WHICH integration before editing', async () => {
            await writeSkills('/projects/test', makeAppBuilderProject());

            const content = writtenContent('extend-app-builder-app');
            expect(content).toMatch(/which integration/i);
        });

        it('states that deploys are per-integration (own OpenWhisk package)', async () => {
            await writeSkills('/projects/test', makeAppBuilderProject());

            const content = writtenContent('extend-app-builder-app');
            expect(content).toMatch(/per-integration/i);
            expect(content).toMatch(/OpenWhisk|I\/O Runtime/i);
        });

        it('no longer frames the target as a single blank shell app', async () => {
            await writeSkills('/projects/test', makeAppBuilderProject());

            const content = writtenContent('extend-app-builder-app');
            expect(content).not.toMatch(/the blank shell/i);
        });
    });

    describe('create-eds-project org-context guidance', () => {
        it('explains per-operation org targeting and that ORG_MISMATCH is non-retryable', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project');
            // Shipped behavior: per-operation targeting, no shared global clobber.
            expect(content).toMatch(/per operation/i);
            expect(content).toContain('ORG_MISMATCH');
            expect(content).toMatch(/do not retry/i);
        });

        it('tells the agent to set its target before Adobe ops and to surface ORG_MISMATCH', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project');
            expect(content).toContain('select_org');
            expect(content).toContain('select_workspace');
        });

        it('no longer frames org context as a shared, process-wide setting', async () => {
            await writeSkills('/projects/test', makeEdsProject());

            const content = writtenContent('create-eds-project');
            expect(content).not.toMatch(/single, process-wide setting/i);
            expect(content).not.toMatch(/global and shared/i);
        });
    });

    describe('removed skills', () => {
        // Each was deleted for a stated reason: Adobe's extensibility tools cover
        // block authoring, and the three use-*-mcp skills described servers the
        // Claude Code session supplies rather than anything we write.
        const REMOVED = [
            'add-block.md',
            'add-custom-block.md',
            'create-block.md',
            'configure-eds.md',
            'edit-block-library.md',
            'modify-content.md',
            'update-styles.md',
            'use-da-live-mcp.md',
            'use-aem-content-mcp.md',
            'use-commerce-dev-mcp.md',
        ];

        it.each(REMOVED)('does not write %s for EDS projects', async (filename) => {
            await writeSkills('/projects/test', makeEdsProject());

            expect(writtenFiles().some((p) => p.endsWith(filename))).toBe(false);
        });

        it.each(REMOVED)('does not write %s for headless projects', async (filename) => {
            await writeSkills('/projects/test', makeHeadlessProject());

            expect(writtenFiles().some((p) => p.endsWith(filename))).toBe(false);
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
        // The regression that made this block worth writing: the source path was
        // the storefront checkout, which never carries a skills/ dir, so all six
        // skills silently ENOENT-skipped on every project ever created. Every
        // test below still passed, because the mock answered whatever path it
        // was handed. Assert the ARGUMENT, not just the outcome.
        it('reads the bundle from the isolated MCP tools dir, never the storefront checkout', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeEdsProject());

            const readdirPaths = (fsPromises.readdir as jest.Mock).mock.calls.map(
                ([dirPath]) => dirPath as string
            );
            expect(readdirPaths).toContain(EDS_STOREFRONT_BUNDLE_PATH);
            expect(
                readdirPaths.filter((dirPath) => dirPath.includes('/components/eds-storefront/'))
            ).toEqual([]);
        });

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

        it('does not copy the aem bundle for headless projects (no EDS storefront)', async () => {
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
            // 14 Demo-Builder skills, and no extend-app-builder-app: an EDS
            // storefront alone is not App Builder work (AI-1o).
            expect(
                files.filter((p) => p.startsWith('/projects/test/.claude/skills/'))
            ).toHaveLength(14);
        });

        it('still writes the three Demo-Builder lifecycle skills when copying the Adobe bundle', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkills('/projects/test', makeEdsProject());

            const files = writtenFiles();
            expect(files.some((p) => p.endsWith('add-component/SKILL.md'))).toBe(true);
            expect(files.some((p) => p.endsWith('sync-changes/SKILL.md'))).toBe(true);
            expect(files.some((p) => p.endsWith('update-credentials/SKILL.md'))).toBe(true);
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
