/**
 * skillInspector tests
 *
 * Walks `<project>/.claude/skills/` and returns a `SkillInventoryEntry[]`.
 * - Top-level `add-component.md` / `sync-changes.md` / `update-credentials.md` → 'demo-builder'
 * - Nested under any subdirectory (Adobe bundle layout from skillsWriter) → 'adobe'
 * - Top-level `.md` not in the demo-builder set → 'unknown'
 *
 * Parses YAML frontmatter using the same regex + yaml.parse pattern as
 * skillsWriter::rewriteNameFrontmatter. Falls back to the filename basename
 * when frontmatter is missing or doesn't include a `name` field.
 */

import * as fsPromises from 'fs/promises';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    readdir: jest.fn(),
}));

import { inspectSkills } from '@/features/ai/skillInspector';
import { DEMO_BUILDER_ALWAYS_ON_SKILLS } from '@/types/ai';

const readFileMock = fsPromises.readFile as jest.Mock;
const readdirMock = fsPromises.readdir as jest.Mock;

const PROJECT_PATH = '/projects/demo';
const SKILLS_DIR = `${PROJECT_PATH}/.claude/skills`;

/**
 * Build a fs/promises mock backed by a virtual directory tree.
 *
 * @param tree  Map of absolute path → 'dir' | string file contents.
 *              Directories appear as keys mapping to `'dir'`; files map to their contents.
 */
function setupFs(tree: Record<string, 'dir' | string>): void {
    readdirMock.mockImplementation(async (dir: string) => {
        const prefix = dir.endsWith('/') ? dir : dir + '/';
        const childNames = new Set<string>();
        for (const key of Object.keys(tree)) {
            if (!key.startsWith(prefix)) continue;
            const remainder = key.slice(prefix.length);
            const firstSeg = remainder.split('/')[0];
            if (firstSeg) childNames.add(firstSeg);
        }
        if (!tree[dir] && childNames.size === 0) {
            const err = new Error(`ENOENT: ${dir}`) as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            throw err;
        }
        return Array.from(childNames).map((name) => {
            const childPath = `${prefix}${name}`;
            const isDir =
                tree[childPath] === 'dir' ||
                Object.keys(tree).some((k) => k.startsWith(childPath + '/'));
            return { name, isFile: () => !isDir, isDirectory: () => isDir };
        }) as never;
    });

    readFileMock.mockImplementation(async (filePath: string) => {
        const value = tree[filePath];
        if (typeof value !== 'string') {
            const err = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            throw err;
        }
        return value;
    });
}

function frontmatter(name: string, description: string, body = 'body'): string {
    return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

describe('inspectSkills', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('directory presence', () => {
        it('returns empty array when skills directory does not exist', async () => {
            setupFs({});

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toEqual([]);
        });

        it('returns empty array when skills directory is present but empty', async () => {
            setupFs({ [SKILLS_DIR]: 'dir' });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toEqual([]);
        });
    });

    describe('demo-builder skill classification', () => {
        it('classifies the three Demo Builder lifecycle skills as demo-builder', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'Add a component'),
                [`${SKILLS_DIR}/sync-changes.md`]: frontmatter('sync-changes', 'Sync changes'),
                [`${SKILLS_DIR}/update-credentials.md`]: frontmatter(
                    'update-credentials',
                    'Update credentials'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(3);
            for (const entry of result) {
                expect(entry.source).toBe('demo-builder');
            }
            expect(result.map((e) => e.name).sort()).toEqual([
                'add-component',
                'sync-changes',
                'update-credentials',
            ]);
        });

        it('classifies both custom-block skills (register + remove) as demo-builder', async () => {
            setupFs({
                [`${SKILLS_DIR}/register-custom-block.md`]: frontmatter(
                    'register-custom-block',
                    'Register a block'
                ),
                [`${SKILLS_DIR}/remove-custom-block.md`]: frontmatter(
                    'remove-custom-block',
                    'Remove a block'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(2);
            for (const entry of result) {
                expect(entry.source).toBe('demo-builder');
            }
        });

        it('extracts the description field from frontmatter', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: frontmatter(
                    'add-component',
                    'Add or enable a component'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].description).toBe('Add or enable a component');
        });
    });

    describe('adobe skill classification (nested bundle layout)', () => {
        it('classifies any md file under a subdirectory as adobe', async () => {
            setupFs({
                [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter(
                    'aem-block-developer',
                    'Block dev'
                ),
                [`${SKILLS_DIR}/aem-content-modeler/SKILL.md`]: frontmatter(
                    'aem-content-modeler',
                    'Content modeler'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(2);
            for (const entry of result) {
                expect(entry.source).toBe('adobe');
            }
        });

        it('walks recursively into nested skill subdirectories', async () => {
            setupFs({
                [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter(
                    'aem-block-developer',
                    'Block dev'
                ),
                [`${SKILLS_DIR}/aem-block-developer/references/details.md`]: frontmatter(
                    'details',
                    'Details'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(2);
            for (const entry of result) {
                expect(entry.source).toBe('adobe');
            }
        });
    });

    describe('unknown skill classification', () => {
        it('classifies top-level non-Demo-Builder md files as unknown', async () => {
            setupFs({
                [`${SKILLS_DIR}/promote-blocks.md`]: frontmatter(
                    'promote-blocks',
                    'Promote blocks'
                ),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(1);
            expect(result[0].source).toBe('unknown');
            expect(result[0].name).toBe('promote-blocks');
        });
    });

    describe('frontmatter parsing', () => {
        it('falls back to filename basename when frontmatter is absent', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: 'No frontmatter here, just body text',
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].name).toBe('add-component');
            expect(result[0].description).toBeNull();
        });

        it('falls back when frontmatter is malformed YAML', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: '---\nname: : invalid\n---\nbody',
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].name).toBe('add-component');
        });

        it('returns null description when name is present but description is not', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: '---\nname: add-component\n---\nbody',
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].name).toBe('add-component');
            expect(result[0].description).toBeNull();
        });
    });

    describe('mixed contents', () => {
        it('classifies a mixed skills tree correctly in a single pass', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'demo builder'),
                [`${SKILLS_DIR}/sync-changes.md`]: frontmatter('sync-changes', 'demo builder'),
                [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter(
                    'aem-block-developer',
                    'adobe'
                ),
                [`${SKILLS_DIR}/promote-blocks.md`]: frontmatter('promote-blocks', 'unknown'),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result).toHaveLength(4);
            const bySource = result.reduce<Record<string, number>>((acc, e) => {
                acc[e.source] = (acc[e.source] ?? 0) + 1;
                return acc;
            }, {});
            expect(bySource).toEqual({ 'demo-builder': 2, adobe: 1, unknown: 1 });
        });
    });

    describe('path field', () => {
        it('returns the absolute file path for each entry', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'demo builder'),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].path).toBe(`${SKILLS_DIR}/add-component.md`);
        });
    });

    describe('non-markdown files', () => {
        it('ignores non-md files at the top level', async () => {
            setupFs({
                [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'demo builder'),
                [`${SKILLS_DIR}/README`]: 'A readme without extension',
                [`${SKILLS_DIR}/notes.txt`]: 'Notes',
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result.map((e) => e.name)).toEqual(['add-component']);
        });
    });

    describe("the demo-builder set is the writer's set, not a copy of it", () => {
        // Two lists used to describe the same 13 skills: skillsWriter's
        // DEMO_BUILDER_SKILLS and a hand-maintained set here. They drifted —
        // diagnose-demo.md shipped in the writer and was never added here, so
        // the modal filed a first-party skill under "Custom".
        it.each(DEMO_BUILDER_ALWAYS_ON_SKILLS)(
            'classifies always-on skill %s as demo-builder',
            async (name) => {
                // The v27+ registrable layout: `<name>/SKILL.md`.
                setupFs({ [`${SKILLS_DIR}/${name}/SKILL.md`]: frontmatter('x', 'y') });

                const result = await inspectSkills(PROJECT_PATH);

                expect(result[0].source).toBe('demo-builder');
                expect(result[0].bundle).toBeUndefined();
            }
        );

        it('classifies a legacy pre-v27 flat <name>.md as demo-builder too', async () => {
            // Projects not yet regenerated still carry the flat layout; a
            // first-party skill must not show as "Custom" there.
            setupFs({ [`${SKILLS_DIR}/diagnose-demo.md`]: frontmatter('x', 'y') });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].source).toBe('demo-builder');
        });

        it('falls back to the DIRECTORY name for a SKILL.md with no frontmatter name', async () => {
            setupFs({ [`${SKILLS_DIR}/diagnose-demo/SKILL.md`]: '# no frontmatter here\n' });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].name).toBe('diagnose-demo');
        });

        it('classifies the conditional extend-app-builder-app skill as demo-builder', async () => {
            // Written only for App Builder-adjacent projects, but authored here
            // all the same — "conditional" is not "third-party".
            setupFs({
                [`${SKILLS_DIR}/extend-app-builder-app.md`]: frontmatter('extend', 'd'),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].source).toBe('demo-builder');
        });
    });

    describe('bundle identity for nested skills', () => {
        it('records the bundle prefix so the UI need not guess which Adobe bundle', async () => {
            // copyAdobeSkillBundle names each directory `<prefix>-<skill>`; the
            // prefix is the only thing distinguishing an AEM bundle from an App
            // Builder one, and it was being discarded.
            setupFs({
                [`${SKILLS_DIR}/appbuilder-architect/SKILL.md`]: frontmatter('a', 'd'),
                [`${SKILLS_DIR}/aem-block-builder/SKILL.md`]: frontmatter('b', 'd'),
            });

            const result = await inspectSkills(PROJECT_PATH);
            const byName = Object.fromEntries(result.map((e) => [e.name, e]));

            expect(byName.a.source).toBe('adobe');
            expect(byName.a.bundle).toBe('appbuilder');
            expect(byName.b.bundle).toBe('aem');
        });

        it('leaves bundle undefined for a directory with no prefix separator', async () => {
            setupFs({ [`${SKILLS_DIR}/loose/SKILL.md`]: frontmatter('c', 'd') });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].source).toBe('adobe');
            expect(result[0].bundle).toBeUndefined();
        });

        it('keeps the bundle of the top directory when a skill nests deeper', async () => {
            setupFs({
                [`${SKILLS_DIR}/appbuilder-tester/refs/deep.md`]: frontmatter('deep', 'd'),
            });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].bundle).toBe('appbuilder');
        });

        it('does not set bundle on top-level skills', async () => {
            setupFs({ [`${SKILLS_DIR}/add-component.md`]: frontmatter('add', 'd') });

            const result = await inspectSkills(PROJECT_PATH);

            expect(result[0].bundle).toBeUndefined();
        });
    });

    describe('error propagation', () => {
        it('propagates non-ENOENT errors from readdir', async () => {
            readdirMock.mockImplementation(async () => {
                const err = new Error('EACCES') as NodeJS.ErrnoException;
                err.code = 'EACCES';
                throw err;
            });

            await expect(inspectSkills(PROJECT_PATH)).rejects.toThrow('EACCES');
        });
    });
});
