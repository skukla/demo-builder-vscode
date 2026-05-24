/**
 * Skills Writer Tests
 *
 * After the AI layer pivot, this writer emits only three Demo-Builder-specific
 * procedural skills. EDS storefront skills come from Adobe's official
 * `@adobe-commerce/commerce-extensibility-tools` package. MCP-usage skills are
 * no longer needed because external MCPs come from Claude Code's session-level
 * catalog.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { writeSkillFiles } from '@/features/project-creation/services/skillsWriter';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn(),
    readFile: jest.fn(),
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

// ─── Adobe skill bundle mock helpers ─────────────────────────────────────────

const ADOBE_BUNDLE_RELATIVE = 'node_modules/@adobe-commerce/commerce-extensibility-tools/dist/aem-boilerplate-commerce/skills';
const EDS_STOREFRONT_BUNDLE_PATH = `/projects/test/components/eds-storefront/${ADOBE_BUNDLE_RELATIVE}`;

function makeDirent(name: string, isDirectory: boolean): { name: string; isDirectory: () => boolean } {
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
            return Object.keys(skillFiles).map(name => makeDirent(name, true));
        }
        // Skill folder contents
        const skillName = Object.keys(skillFiles).find(name =>
            dirPath === path.join(EDS_STOREFRONT_BUNDLE_PATH, name),
        );
        if (skillName) {
            return skillFiles[skillName].map(filename => makeDirent(filename, false));
        }
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
    });

    readFileMock.mockImplementation(async (filePath: string) => {
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
        const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        throw err;
    });
}

describe('skillsWriter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: no Adobe bundle present. Individual tests can override.
        mockMissingAdobeBundle();
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

        it('writes exactly three skill files when the Adobe skill bundle is not present', async () => {
            mockMissingAdobeBundle();
            await writeSkillFiles('/projects/test', makeEdsProject());

            expect(writtenFiles()).toHaveLength(3);
        });

        it('each written skill file is non-empty and starts with YAML frontmatter or an H1', async () => {
            await writeSkillFiles('/projects/test', makeEdsProject());

            const writeFileMock = fsPromises.writeFile as jest.Mock;
            const calls = writeFileMock.mock.calls;

            expect(calls.length).toBe(3);
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
            await writeSkillFiles('/projects/test', makeEdsProject());

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
            await writeSkillFiles('/projects/test', makeEdsProject());

            const content = writtenContent('sync-changes.md');
            expect(content).toContain('sync_storefront');
        });
    });

    describe('removed skills', () => {
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

    describe('Adobe skill bundle copy', () => {
        it('copies each skill folder from the bundle to .claude/skills/<prefix>-<skill>/', async () => {
            mockAdobeSkillBundle({
                'block-developer': ['SKILL.md'],
                'tester': ['SKILL.md'],
            });

            await writeSkillFiles('/projects/test', makeEdsProject());

            const files = writtenFiles();
            expect(files).toEqual(expect.arrayContaining([
                '/projects/test/.claude/skills/aem-block-developer/SKILL.md',
                '/projects/test/.claude/skills/aem-tester/SKILL.md',
            ]));
        });

        it('rewrites the `name:` frontmatter field to match the prefixed folder name', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkillFiles('/projects/test', makeEdsProject());

            const content = writtenContentForPath('/projects/test/.claude/skills/aem-block-developer/SKILL.md');
            expect(content).toMatch(/^---\n[\s\S]*?\bname:\s*aem-block-developer\b[\s\S]*?\n---/);
            // The original `name: block-developer` is gone
            expect(content).not.toMatch(/^---\n[\s\S]*?\bname:\s*block-developer\s*$/m);
        });

        it('preserves the body of the SKILL.md after frontmatter rewrite', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkillFiles('/projects/test', makeEdsProject());

            const content = writtenContentForPath('/projects/test/.claude/skills/aem-block-developer/SKILL.md');
            expect(content).toContain('# block-developer');
            expect(content).toContain('Body for block-developer.');
        });

        it('copies non-markdown files verbatim (no frontmatter rewrite)', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md', 'helper.ts'] });

            await writeSkillFiles('/projects/test', makeEdsProject());

            const content = writtenContentForPath('/projects/test/.claude/skills/aem-block-developer/helper.ts');
            expect(content).toBe('content of helper.ts');
        });

        it('does not copy Adobe skills for headless projects (no aiSkillBundle declared)', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkillFiles('/projects/test', makeHeadlessProject());

            const files = writtenFiles();
            expect(files.some(p => p.includes('/.claude/skills/aem-'))).toBe(false);
        });

        it('skips gracefully when the Adobe package is not yet installed (ENOENT)', async () => {
            mockMissingAdobeBundle();

            await expect(writeSkillFiles('/projects/test', makeEdsProject())).resolves.toBeUndefined();

            const files = writtenFiles();
            expect(files.some(p => p.includes('/.claude/skills/aem-'))).toBe(false);
            // Demo-Builder skills still written
            expect(files.filter(p => p.startsWith('/projects/test/.claude/skills/'))).toHaveLength(3);
        });

        it('still writes the three Demo-Builder lifecycle skills when copying the Adobe bundle', async () => {
            mockAdobeSkillBundle({ 'block-developer': ['SKILL.md'] });

            await writeSkillFiles('/projects/test', makeEdsProject());

            const files = writtenFiles();
            expect(files.some(p => p.endsWith('add-component.md'))).toBe(true);
            expect(files.some(p => p.endsWith('sync-changes.md'))).toBe(true);
            expect(files.some(p => p.endsWith('update-credentials.md'))).toBe(true);
        });
    });
});

function writtenContentForPath(filePath: string): string | undefined {
    const writeFileMock = fsPromises.writeFile as jest.Mock;
    const call = writeFileMock.mock.calls.find(([p]: [string]) => p === filePath);
    return call?.[1] as string | undefined;
}
