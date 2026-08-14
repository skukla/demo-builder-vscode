/**
 * Skills Writer — MCP-tool-availability gating (ADR-013 Step 4).
 *
 * The three Playwright-driving skills (`SKILL_MCP_TOOL_DEPENDENCIES`) are
 * written only when their tool is usable by the project RIGHT NOW: the
 * ai-defaults entry applies (playwright `requires: 'eds-storefront'`) AND its
 * package is declared in the isolated `.demo-builder-mcp` manifest. A
 * gated-out skill is not written, does not appear in `summary.written`, and a
 * previously-delivered copy is reconciled through `writer.remove` — the
 * ADR-013 removal matrix, which demands positive proof of ownership (recorded
 * hash match, or no recorded hash + byte-equal to today's template). The
 * matrix itself is pinned in generatedFileWriter.test.ts; this suite pins the
 * ROUTING and the data-loss guards.
 *
 * Split from skillsWriter.test.ts (at the max-lines cap) and
 * skillsWriter.hashAndSkip.test.ts (routing only, no gating).
 */

import { createHash } from 'crypto';
import * as path from 'path';
import * as fsPromises from 'fs/promises';
import {
    enoentError,
    makeTestWriter,
    mcpToolsManifest,
} from './generatedFileWriter.testUtils';
import {
    DEMO_BUILDER_SKILLS,
    writeSkillFiles,
} from '@/features/project-creation/services/skillsWriter';
import { SKILL_MCP_TOOL_DEPENDENCIES } from '@/types/ai';
import type { Project, ComponentInstance } from '@/types/base';

jest.mock('fs/promises', () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    return {
        lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        realpath: jest.fn(async (p: string) => p),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile,
        readdir: jest.fn(),
        readFile: jest.fn(),
        unlink: jest.fn().mockResolvedValue(undefined),
        // O_NOFOLLOW writes go through open(); the returned handle delegates to
        // the writeFile mock WITH the path, so path-based assertions keep working.
        open: jest.fn(async (p: unknown) => ({
            writeFile: jest.fn(async (d: unknown, e: unknown) => writeFile(p as string, d, e)),
            close: jest.fn(async () => undefined),
        })),
    };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROJECT_PATH = '/projects/test';
const MANIFEST_PATH = `${PROJECT_PATH}/.demo-builder-mcp/package.json`;

/** The gated skill filenames, read from the same map the writer consumes. */
const PLAYWRIGHT_SKILLS = Object.keys(SKILL_MCP_TOOL_DEPENDENCIES);

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/** Today's template content for an always-on skill (what we would write). */
function templateFor(filename: string): string {
    const entry = DEMO_BUILDER_SKILLS.find((skill) => skill.filename === filename);
    if (!entry) throw new Error(`No template for ${filename}`);
    return entry.content;
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: PROJECT_PATH,
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: '/projects/test/components/eds-storefront',
                metadata: { githubRepo: 'owner/my-repo' },
            },
        },
        ...overrides,
    };
}

function makeBareHeadlessProject(): Project {
    return makeEdsProject({ selectedStack: 'headless-paas', componentInstances: {} });
}

function makeMeshOnlyProject(): Project {
    return makeEdsProject({
        selectedStack: 'headless-paas',
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

/** Exact-path disk fixture: listed paths have content, everything else ENOENTs. */
function mockDisk(byPath: Record<string, string> = {}): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
        if (p in byPath) return byPath[p];
        throw enoentError();
    });
}

function playwrightInstalled(): Record<string, string> {
    return { [MANIFEST_PATH]: mcpToolsManifest(['@playwright/mcp']) };
}

function writtenFiles(): string[] {
    return (fsPromises.writeFile as jest.Mock).mock.calls.map(([p]: [string]) => p);
}

function unlinkedFiles(): string[] {
    return (fsPromises.unlink as jest.Mock).mock.calls.map(([p]: [string]) => p);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('skillsWriter — playwright-skill gating on tool availability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // No Adobe bundles installed anywhere.
        (fsPromises.readdir as jest.Mock).mockImplementation(async () => {
            throw enoentError();
        });
        mockDisk();
    });

    it('the dependency map still names exactly the three playwright skills (fixture guard)', () => {
        expect([...PLAYWRIGHT_SKILLS].sort()).toEqual([
            'connect-authenticated-site.md',
            'refine-visual-match.md',
            'scrape-reference-site.md',
        ]);
    });

    describe('EDS project (playwright entry applies)', () => {
        it('writes all fourteen skills when @playwright/mcp is installed (pins hold)', async () => {
            mockDisk(playwrightInstalled());

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), makeTestWriter(PROJECT_PATH));

            expect(writtenFiles()).toHaveLength(14);
            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(writtenFiles().some((p) => p.endsWith(filename))).toBe(true);
            }
        });

        it('writes three fewer skills when @playwright/mcp is not in the manifest', async () => {
            mockDisk({ [MANIFEST_PATH]: mcpToolsManifest(['@some/other-package']) });

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), makeTestWriter(PROJECT_PATH));

            expect(writtenFiles()).toHaveLength(11);
            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(writtenFiles().some((p) => p.endsWith(filename))).toBe(false);
            }
        });

        it('gates the playwright skills out when no tools manifest exists at all', async () => {
            mockDisk(); // nothing on disk — nothing installed

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), makeTestWriter(PROJECT_PATH));

            expect(writtenFiles()).toHaveLength(11);
        });

        it('excludes gated-out skills from summary.written', async () => {
            mockDisk();

            const summary = await writeSkillFiles(
                PROJECT_PATH,
                makeEdsProject(),
                makeTestWriter(PROJECT_PATH)
            );

            expect(summary.written).toHaveLength(11);
            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(summary.written).not.toContain(filename);
            }
        });

        it('keeps the conditional extend-app-builder-app skill when playwright is gated out', async () => {
            mockDisk();

            const summary = await writeSkillFiles(
                PROJECT_PATH,
                makeEdsProject(),
                makeTestWriter(PROJECT_PATH)
            );

            expect(summary.written).toContain('extend-app-builder-app.md');
            expect(writtenFiles().some((p) => p.endsWith('extend-app-builder-app.md'))).toBe(true);
        });

        it('records no hash entries for gated-out skills', async () => {
            mockDisk();
            const writer = makeTestWriter(PROJECT_PATH);

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(writer.hashes()).not.toHaveProperty([`.claude/skills/${filename}`]);
            }
        });
    });

    describe('non-EDS projects (playwright entry never applies)', () => {
        it('no longer writes the playwright skills for a bare headless project — even with the package installed, the entry requires an EDS storefront (intended change: they were written but useless before)', async () => {
            mockDisk(playwrightInstalled());

            await writeSkillFiles(
                PROJECT_PATH,
                makeBareHeadlessProject(),
                makeTestWriter(PROJECT_PATH)
            );

            // 13 always-on minus the 3 playwright skills; no extend-app-builder-app
            // (a bare project needs no App Builder tooling).
            expect(writtenFiles()).toHaveLength(10);
            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(writtenFiles().some((p) => p.endsWith(filename))).toBe(false);
            }
        });

        it('gates the playwright skills for a mesh-only project while still writing extend-app-builder-app', async () => {
            mockDisk(playwrightInstalled());

            const summary = await writeSkillFiles(
                PROJECT_PATH,
                makeMeshOnlyProject(),
                makeTestWriter(PROJECT_PATH)
            );

            // 10 gated always-on + the conditional extend-app-builder-app.
            expect(summary.written).toHaveLength(11);
            expect(summary.written).toContain('extend-app-builder-app.md');
            for (const filename of PLAYWRIGHT_SKILLS) {
                expect(summary.written).not.toContain(filename);
            }
        });
    });

    describe('return summary contract (moved from skillsWriter.test.ts — max-lines cap)', () => {
        it('returns the attempted skill filenames when playwright is installed (13 always-on + conditional)', async () => {
            mockDisk(playwrightInstalled());

            const summary = await writeSkillFiles(
                PROJECT_PATH,
                makeEdsProject(),
                makeTestWriter(PROJECT_PATH)
            );

            expect(summary.written).toEqual(
                expect.arrayContaining([
                    'add-component.md',
                    'sync-changes.md',
                    'update-credentials.md',
                    'create-eds-project.md',
                    'diagnose-demo.md',
                    'register-custom-block.md',
                ])
            );
            // Thirteen always-written skills + the conditional extend-app-builder-app.
            expect(summary.written).toHaveLength(14);
            expect(summary.written).toContain('extend-app-builder-app.md');
        });

        it('returns bare filenames (basenames), not absolute paths', async () => {
            mockDisk(playwrightInstalled());

            const summary = await writeSkillFiles(
                PROJECT_PATH,
                makeEdsProject(),
                makeTestWriter(PROJECT_PATH)
            );

            for (const name of summary.written) {
                expect(path.basename(name)).toBe(name);
            }
        });
    });

    describe('reconciling previously-delivered copies (removal matrix routing)', () => {
        const GATED_REL = '.claude/skills/scrape-reference-site.md';
        const GATED_ABS = `${PROJECT_PATH}/${GATED_REL}`;

        it('removes an unedited previously-generated copy (recorded hash matches disk)', async () => {
            const lastGenerated = 'content we generated last time';
            mockDisk({ [GATED_ABS]: lastGenerated });
            const writer = makeTestWriter(PROJECT_PATH, {
                [GATED_REL]: sha256(lastGenerated),
            });

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(unlinkedFiles()).toContain(GATED_ABS);
            expect(writer.report().removed).toContain(GATED_REL);
            expect(writer.hashes()).not.toHaveProperty([GATED_REL]);
        });

        it('DATA-LOSS GUARD: leaves a user-edited copy on disk (recorded hash mismatch) and reports it skipped', async () => {
            mockDisk({ [GATED_ABS]: '# the user rewrote this skill' });
            const writer = makeTestWriter(PROJECT_PATH, {
                [GATED_REL]: sha256('what we generated last time'),
            });

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(unlinkedFiles()).not.toContain(GATED_ABS);
            expect(writer.report().skipped).toContain(GATED_REL);
            // They own it now — the recorded hash entry is left as-is.
            expect(writer.hashes()[GATED_REL]).toBe(sha256('what we generated last time'));
        });

        it('DATA-LOSS GUARD: leaves a pre-ADR copy (no recorded hash) that differs from today\'s template', async () => {
            mockDisk({ [GATED_ABS]: '# an old or edited copy, provenance unknown' });
            const writer = makeTestWriter(PROJECT_PATH); // no recorded hashes

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(unlinkedFiles()).not.toContain(GATED_ABS);
            expect(writer.report().skipped).toContain(GATED_REL);
        });

        it('removes a pre-ADR copy that is byte-equal to today\'s template (provably ours)', async () => {
            mockDisk({ [GATED_ABS]: templateFor('scrape-reference-site.md') });
            const writer = makeTestWriter(PROJECT_PATH); // no recorded hashes

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(unlinkedFiles()).toContain(GATED_ABS);
            expect(writer.report().removed).toContain(GATED_REL);
        });

        it('drops a stale hash entry when the gated skill is already absent from disk', async () => {
            mockDisk(); // absent
            const writer = makeTestWriter(PROJECT_PATH, {
                [GATED_REL]: sha256('what we generated last time'),
            });

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(writer.hashes()).not.toHaveProperty([GATED_REL]);
            expect(writer.report().removed).not.toContain(GATED_REL);
            expect(writer.report().skipped).not.toContain(GATED_REL);
            expect(unlinkedFiles()).toHaveLength(0);
        });

        it('attempts no removals when playwright is available', async () => {
            mockDisk(playwrightInstalled());
            const writer = makeTestWriter(PROJECT_PATH);

            await writeSkillFiles(PROJECT_PATH, makeEdsProject(), writer);

            expect(unlinkedFiles()).toHaveLength(0);
            expect(writer.report().removed).toHaveLength(0);
        });
    });
});
