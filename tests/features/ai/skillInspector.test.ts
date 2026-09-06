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
        });
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

/**
 * A skill file as one is actually written: frontmatter, then PROSE.
 *
 * The default body carries whitespace on purpose. A one-word body made the
 * frontmatter regex's `([\s\S]*)` tail indistinguishable from `([\S\S]*)` —
 * non-whitespace only — across every test in this file, so a regex that could
 * not parse any real skill would have passed the suite.
 */
function frontmatter(name: string, description: string, body = '# Heading\n\nBody prose.\n'): string {
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

// ---------------------------------------------------------------------------
// What the walk asks the filesystem for.
//
// Every classification above depends on `isFile()` / `isDirectory()`, which only
// exist because the readdir call asks for Dirents. Without `withFileTypes` the
// entries come back as plain strings and every skill falls through to 'unknown' —
// a mock that returns Dirents whatever it is handed cannot see that, so the CALL
// is what has to be asserted.
// ---------------------------------------------------------------------------
describe('what inspectSkills asks the filesystem for', () => {
    it('reads the skills directory with file types', async () => {
        setupFs({ [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'd') });

        await inspectSkills(PROJECT_PATH);

        expect(readdirMock).toHaveBeenCalledWith(SKILLS_DIR, { withFileTypes: true });
    });

    it('reads a bundle subdirectory with file types too', async () => {
        setupFs({ [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter('a', 'd') });

        await inspectSkills(PROJECT_PATH);

        expect(readdirMock).toHaveBeenCalledWith(`${SKILLS_DIR}/aem-block-developer`, {
            withFileTypes: true,
        });
    });

    it('reads each skill file as utf-8 text', async () => {
        setupFs({ [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'd') });

        await inspectSkills(PROJECT_PATH);

        expect(readFileMock).toHaveBeenCalledWith(`${SKILLS_DIR}/add-component.md`, 'utf-8');
    });

    // A non-md file at the top level is not a bundle. Treating it as one lists a
    // text file's directory, which on a real filesystem is ENOTDIR — an inventory
    // that throws on a stray README rather than ignoring it.
    it('does not try to list a top-level file as a directory', async () => {
        setupFs({
            [`${SKILLS_DIR}/add-component.md`]: frontmatter('add-component', 'd'),
            [`${SKILLS_DIR}/notes.txt`]: 'Notes',
        });

        await inspectSkills(PROJECT_PATH);

        expect(readdirMock).not.toHaveBeenCalledWith(
            `${SKILLS_DIR}/notes.txt`,
            expect.anything()
        );
    });

    it('does not try to list a NESTED file as a directory', async () => {
        setupFs({
            [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter('a', 'd'),
            [`${SKILLS_DIR}/aem-block-developer/notes.txt`]: 'Notes',
        });

        await inspectSkills(PROJECT_PATH);

        expect(readdirMock).not.toHaveBeenCalledWith(
            `${SKILLS_DIR}/aem-block-developer/notes.txt`,
            expect.anything()
        );
    });
});

describe('what counts as a skill inside a bundle', () => {
    // Only `.md` files. A bundle ships scripts, assets and references alongside
    // its skills; listing those as skills fills the catalogue with things nobody
    // can invoke.
    it('ignores non-md files nested in a bundle', async () => {
        setupFs({
            [`${SKILLS_DIR}/aem-block-developer/SKILL.md`]: frontmatter('a', 'd'),
            [`${SKILLS_DIR}/aem-block-developer/helper.py`]: 'print()',
            [`${SKILLS_DIR}/aem-block-developer/refs/notes.txt`]: 'notes',
        });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result.map((e) => e.name)).toEqual(['a']);
    });
});

describe('the bundle prefix', () => {
    // `<prefix>-<skill>` needs a prefix BEFORE the separator. A name that merely
    // starts with one has no prefix, and reporting an empty string as the bundle
    // groups it under a heading with no name.
    it('reports no bundle for a directory whose name starts with the separator', async () => {
        setupFs({ [`${SKILLS_DIR}/-orphan/SKILL.md`]: frontmatter('c', 'd') });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result[0].source).toBe('adobe');
        expect(result[0].bundle).toBeUndefined();
    });
});

describe('frontmatter that is present but says nothing usable', () => {
    // An EMPTY block parses to null, not to an object. Treating null as the
    // parsed frontmatter reads `.name` off it and takes the whole inventory down
    // with a TypeError.
    it('falls back to the basename for an empty frontmatter block', async () => {
        setupFs({ [`${SKILLS_DIR}/add-component.md`]: '---\n\n---\n# Heading\n\nProse.\n' });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result[0].name).toBe('add-component');
        expect(result[0].description).toBeNull();
    });

    // A blank `name:` is not a name. Using it renders an entry with no label.
    it('falls back to the basename when name is an empty string', async () => {
        setupFs({
            [`${SKILLS_DIR}/add-component.md`]: '---\nname: ""\ndescription: d\n---\nProse here.\n',
        });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result[0].name).toBe('add-component');
        expect(result[0].description).toBe('d');
    });

    it('falls back to the DIRECTORY name when a SKILL.md names itself blank', async () => {
        setupFs({
            [`${SKILLS_DIR}/diagnose-demo/SKILL.md`]: '---\nname: ""\n---\nProse here.\n',
        });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result[0].name).toBe('diagnose-demo');
    });

    // Frontmatter is the block at the TOP of the file. A `---` rule further down
    // is Markdown, and reading it as frontmatter names the skill after whatever
    // happens to sit under that rule.
    it('does not read a --- rule in the body as frontmatter', async () => {
        setupFs({
            [`${SKILLS_DIR}/add-component.md`]:
                '# Heading\n\n---\nname: not-the-name\n---\n\nMore prose.\n',
        });

        const result = await inspectSkills(PROJECT_PATH);

        expect(result[0].name).toBe('add-component');
        expect(result[0].description).toBeNull();
    });
});
