/**
 * Adobe skill-bundle copy: the edges of the walk and the frontmatter rewrite.
 *
 * The sibling suite (`skillsWriter.test.ts`) pins the happy path — which paths
 * are read and which files land. This one pins the DECISIONS that path makes
 * and that a mock will otherwise answer for: the `withFileTypes` arguments the
 * walk depends on, what happens to a non-directory entry, a nested folder, a
 * readdir failure that is not ENOENT, and every shape of `.md` frontmatter the
 * rewrite has to leave alone.
 *
 * The bundle fixture is a real-ish filesystem (`mockAdobeBundleTree`): readdir
 * on a file rejects ENOTDIR and readFile on a directory rejects EISDIR, so
 * "the writer skipped it" is distinguishable from "the mock answered anyway".
 */

import { fsPromises } from './aiBundleFsMock';
import * as path from 'path';
import { makeEdsProject } from './aiBundleFixtures';
import { makeTestWriter } from './generatedFileWriter.testUtils';
import {
    EDS_STOREFRONT_BUNDLE_PATH,
    copiedSkillPath,
    mockAdobeBundleTree,
} from './skillsWriter.testUtils';
import { writeSkillFiles } from '@/features/project-creation/services/aiBundle/skillsWriter';

const PROJECT_PATH = '/projects/test';

function writeSkills(): ReturnType<typeof writeSkillFiles> {
    return writeSkillFiles(PROJECT_PATH, makeEdsProject(), makeTestWriter(PROJECT_PATH));
}

/** Content the writer landed at `filePath`, or undefined when it never wrote. */
function landed(filePath: string): string | undefined {
    return (fsPromises.writeFile as jest.Mock).mock.calls.find(
        ([target]: [string]) => target === filePath
    )?.[1] as string | undefined;
}

function writtenPaths(): string[] {
    return (fsPromises.writeFile as jest.Mock).mock.calls.map(([p]: [string]) => String(p));
}

/** One bundle skill whose single SKILL.md carries `raw`. */
function bundleWithSkillMd(raw: string): void {
    mockAdobeBundleTree({ 'block-developer': { 'SKILL.md': raw } });
}

const COPIED_SKILL_MD = copiedSkillPath('aem-block-developer', 'SKILL.md');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('walking the bundle', () => {
    it('creates the skills directory recursively before anything is copied', async () => {
        mockAdobeBundleTree({});

        await writeSkills();

        expect(fsPromises.mkdir).toHaveBeenCalledWith(
            path.join(PROJECT_PATH, '.claude', 'skills'),
            { recursive: true }
        );
    });

    it('reads both the bundle root and each skill folder with file types', async () => {
        // The walk branches on `entry.isDirectory()`, which only exists when
        // readdir is asked for dirents — without the option every entry is a
        // bare string and the copy silently does nothing.
        mockAdobeBundleTree({ 'block-developer': { 'SKILL.md': 'x' } });

        await writeSkills();

        expect(fsPromises.readdir).toHaveBeenCalledWith(EDS_STOREFRONT_BUNDLE_PATH, {
            withFileTypes: true,
        });
        expect(fsPromises.readdir).toHaveBeenCalledWith(
            path.join(EDS_STOREFRONT_BUNDLE_PATH, 'block-developer'),
            { withFileTypes: true }
        );
    });

    it('skips a loose file sitting beside the skill folders', async () => {
        mockAdobeBundleTree({
            'block-developer': { 'SKILL.md': 'x' },
            'README.md': 'bundle readme',
        });

        await expect(writeSkills()).resolves.toMatchObject({ written: expect.any(Array) });

        expect(writtenPaths()).toContain(COPIED_SKILL_MD);
        expect(writtenPaths().some((p) => p.includes('aem-README.md'))).toBe(false);
    });

    it('copies a nested folder inside a skill, keeping its relative path', async () => {
        mockAdobeBundleTree({
            'block-developer': {
                'SKILL.md': 'x',
                references: { 'guide.md': 'nested guide' },
            },
        });

        await writeSkills();

        expect(landed(copiedSkillPath('aem-block-developer', 'references', 'guide.md'))).toBe(
            'nested guide'
        );
    });

    it('rethrows a bundle read failure that is not a missing bundle', async () => {
        // ENOENT means "not installed yet" and is skipped silently; anything
        // else is a real disk problem the caller has to see.
        (fsPromises.readdir as jest.Mock).mockRejectedValue(
            Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
        );
        (fsPromises.readFile as jest.Mock).mockRejectedValue(
            Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        );

        await expect(writeSkills()).rejects.toThrow('EACCES: permission denied');
    });
});

describe('rewriting the name: frontmatter', () => {
    it('renames the skill and leaves the rest of the block byte-exact', async () => {
        bundleWithSkillMd('---\nname: block-developer\ndescription: d\n---\n\n# Title\n');

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(
            '---\nname: aem-block-developer\ndescription: d\n---\n\n# Title\n'
        );
    });

    it('leaves a file with no frontmatter alone', async () => {
        const raw = '# Just a heading\n\nand a body.\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('leaves a fence that does not start the file alone', async () => {
        // The `^` anchor is the whole rule: a horizontal rule mid-document
        // reads as an opening fence without it, and the body gets truncated.
        const raw = 'Intro paragraph.\n---\nname: something\n---\nrest of the body\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('leaves an empty frontmatter block alone', async () => {
        const raw = '---\n\n---\nbody\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('leaves frontmatter that parses to a scalar alone', async () => {
        const raw = '---\njust a scalar\n---\nbody\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('leaves unparseable frontmatter alone', async () => {
        const raw = '---\nname: [unclosed\n---\nbody\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('leaves frontmatter without a name field alone', async () => {
        const raw = '---\ndescription: no name here\n---\nbody\n';
        bundleWithSkillMd(raw);

        await writeSkills();

        expect(landed(COPIED_SKILL_MD)).toBe(raw);
    });

    it('copies a non-markdown file without touching its contents', async () => {
        mockAdobeBundleTree({
            'block-developer': { 'helper.ts': '---\nname: block-developer\n---\nnot markdown\n' },
        });

        await writeSkills();

        expect(landed(copiedSkillPath('aem-block-developer', 'helper.ts'))).toBe(
            '---\nname: block-developer\n---\nnot markdown\n'
        );
    });
});
