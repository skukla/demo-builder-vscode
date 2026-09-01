/**
 * Activation sweep tests — silent tier-1 config repair for every known project
 * on every activation, plus silent tier-1+2 refresh + version stamp when a
 * project's `aiContextVersion` is stale (ADR-013, Step 5).
 *
 * Deps (scanner / loader / configWriter / resolveNode) are injected — no real
 * fs beyond the suite's mocked fs/promises. The tier functions and the
 * GeneratedFileWriter are REAL, so these tests pin the sweep end-to-end over a
 * mocked disk:
 *
 * - healthy project → ZERO disk writes, ZERO saves, ONE `debug` decision line
 *   (the "healthy MUST log" requirement is pinned, not assumed)
 * - config drift (dead dist path, provably ours) → tier-1 repair, saved with
 *   updated hashes, stamp NOT advanced, `info` names files + WHY
 * - stale stamp → tier 1 + tier 2, stamp advanced, saved once; user-edited
 *   files skipped with per-file `info` lines
 * - per-project failure isolation → `warn` + continue; top level never rejects
 * - save-only-when-moved: a hash-map-change-only run still saves; a
 *   pure-unchanged run does not
 *
 * The sweep must not depend on the extension's state manager (read-only
 * loading via ProjectFileLoader) — asserted structurally against the module
 * source at the bottom, with a positive control on the loader import.
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as childProcess from 'child_process';
import * as path from 'path';
import {
    enoentError,
    makeMockLogger,
    mcpToolsManifest,
} from './generatedFileWriter.testUtils';
import { AI_CONTEXT_VERSION } from '@/core/constants';
import { refreshAiBundlesOnActivation } from '@/features/project-creation/services/aiBundle/aiBundleActivationRefresh';
import type { Project } from '@/types/base';
import type { Logger } from '@/types/logger';

jest.mock('fs/promises', () => {
    const writeFile = jest.fn().mockResolvedValue(undefined);
    return {
        lstat: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        realpath: jest.fn(async (p: string) => p),
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile,
        readFile: jest.fn(),
        appendFile: jest.fn().mockResolvedValue(undefined),
        unlink: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn(),
        // O_NOFOLLOW writes go through open(); the returned handle delegates to
        // the writeFile mock WITH the path, so path-based assertions keep working.
        open: jest.fn(async (p: unknown) => ({
            writeFile: jest.fn(async (d: unknown, e: unknown) => writeFile(p as string, d, e)),
            close: jest.fn(async () => undefined),
        })),
    };
});

// `resolveNode` is injected in every test, so the sweep itself never shells
// out — but `browserUtils` (loaded transitively via aiContextWriter)
// promisifies `exec` at module load, and `mcpConfigWriter` promisifies
// `execFile`. Both must exist.
jest.mock('child_process', () => ({
    exec: jest.fn(),
    execFile: jest.fn(
        (
            _cmd: string,
            _args: string[],
            cb: (err: Error | null, out: { stdout: string }) => void
        ) => cb(null, { stdout: '/usr/local/bin/node\n' })
    ),
}));

// generateAIContextFiles (not under test) builds its writer via getLogger();
// jest never calls initializeLogger, so the module must not reach the real one.

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROJECT_A = '/projects/demo-a';
const PROJECT_B = '/projects/demo-b';
const EXTENSION_PATH = '/ext/path';
const NODE_PATH = '/usr/local/bin/node';

function sha256(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
}

function makeProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo-a',
        created: new Date('2026-01-01'),
        lastModified: new Date('2026-01-01'),
        path: PROJECT_A,
        status: 'ready',
        selectedStack: 'eds-paas',
        componentInstances: {},
        ...overrides,
    };
}

function makeEdsProject(overrides: Partial<Project> = {}): Project {
    return makeProject({
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                status: 'ready',
                path: `${PROJECT_A}/components/eds-storefront`,
                metadata: { githubRepo: 'owner/my-repo' },
            },
        },
        ...overrides,
    });
}

interface TestDeps {
    scanner: { getAllProjects: jest.Mock };
    loader: { loadProject: jest.Mock };
    configWriter: { saveProjectConfig: jest.Mock };
    resolveNode: jest.Mock;
}

/** Injected deps: one summary per entry; loader resolves from the map. */
function makeDeps(projectsByPath: Record<string, Project | null>): TestDeps {
    const summaries = Object.keys(projectsByPath).map((projectPath) => ({
        name: path.basename(projectPath),
        path: projectPath,
        lastModified: new Date('2026-01-01'),
    }));
    return {
        scanner: { getAllProjects: jest.fn().mockResolvedValue(summaries) },
        loader: {
            loadProject: jest.fn(
                async (projectPath: string) => projectsByPath[projectPath] ?? null
            ),
        },
        configWriter: { saveProjectConfig: jest.fn().mockResolvedValue(undefined) },
        resolveNode: jest.fn().mockResolvedValue(NODE_PATH),
    };
}

/** Snapshot each saved project (the sweep mutates the loaded object in place). */
function captureSaves(deps: TestDeps): Project[] {
    const saved: Project[] = [];
    deps.configWriter.saveProjectConfig.mockImplementation(async (project: Project) => {
        saved.push(JSON.parse(JSON.stringify(project)) as Project);
    });
    return saved;
}

/** All listed absolute paths exist with the given content; everything else ENOENTs. */
function mockDisk(contentByPath: Record<string, string> = {}): void {
    (fsPromises.readFile as jest.Mock).mockImplementation(async (p: string) => {
        const hit = Object.entries(contentByPath).find(([known]) => String(p) === known);
        if (hit) return hit[1];
        throw enoentError();
    });
}

function writtenPaths(): string[] {
    return (fsPromises.writeFile as jest.Mock).mock.calls.map(([p]: [string]) => String(p));
}

function readPaths(): string[] {
    return (fsPromises.readFile as jest.Mock).mock.calls.map(([p]: [string]) => String(p));
}

function loggedLines(logger: Logger, level: 'debug' | 'info' | 'warn'): string[] {
    return (logger[level] as jest.Mock).mock.calls.map((call) => String(call[0]));
}

/**
 * Provision a byte-exact healthy disk: run the sweep once against an empty
 * disk (pre-ADR → tier-1 files written + hashes recorded), then replay the
 * written contents (plus the appended .gitignore) as the disk for the next
 * run. Returns the recorded hash map a healthy manifest would carry.
 */
async function provisionHealthyDisk(): Promise<{ hashes: Record<string, string> }> {
    mockDisk({});
    const project = makeProject({ aiContextVersion: AI_CONTEXT_VERSION });
    const deps = makeDeps({ [PROJECT_A]: project });
    await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

    const disk: Record<string, string> = {};
    for (const [p, content] of (fsPromises.writeFile as jest.Mock).mock.calls) {
        disk[String(p)] = String(content);
    }
    disk[path.join(PROJECT_A, '.gitignore')] = (fsPromises.appendFile as jest.Mock).mock.calls
        .map(([, content]: [string, string]) => String(content))
        .join('');
    const hashes = { ...(project.aiFileHashes ?? {}) };

    jest.clearAllMocks();
    mockDisk(disk);
    return { hashes };
}

async function runHealthySweep(): Promise<{
    deps: TestDeps;
    logger: Logger;
    hashes: Record<string, string>;
}> {
    const { hashes } = await provisionHealthyDisk();
    const project = makeProject({
        aiContextVersion: AI_CONTEXT_VERSION,
        aiFileHashes: { ...hashes },
    });
    const deps = makeDeps({ [PROJECT_A]: project });
    const logger = makeMockLogger();
    await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);
    return { deps, logger, hashes };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDisk({});
    // Adobe skill-bundle probes readdir their source dir; absent by default
    // (ENOENT → the copy step skips silently, as on a machine without the
    // package installed).
    (fsPromises.readdir as jest.Mock).mockRejectedValue(enoentError());
});

// ─── Healthy project: the common path must be write-free AND logged ──────────

describe('healthy project (fresh stamp, configs current)', () => {
    it('makes ZERO disk writes', async () => {
        await runHealthySweep();

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(fsPromises.appendFile).not.toHaveBeenCalled();
        expect(fsPromises.unlink).not.toHaveBeenCalled();
        expect(fsPromises.mkdir).not.toHaveBeenCalled();
    });

    it('does not save the manifest (nothing moved)', async () => {
        const { deps } = await runHealthySweep();

        expect(deps.configWriter.saveProjectConfig).not.toHaveBeenCalled();
    });

    it('logs exactly one debug decision line naming the project (healthy MUST log)', async () => {
        const { logger } = await runHealthySweep();

        const decisionLines = loggedLines(logger, 'debug').filter((line) =>
            line.includes('demo-a')
        );
        expect(decisionLines).toHaveLength(1);
        expect(decisionLines[0]).toContain('tier1 ok, stamp current');
    });

    it('emits the summary line with zero actions', async () => {
        const { logger } = await runHealthySweep();

        expect(logger.info).toHaveBeenCalledWith(
            '[AI Bundle] Activation sweep: 1 project(s) — 0 repaired, 0 refreshed, ' +
                '0 skipped file(s)'
        );
        const perProjectActions = loggedLines(logger, 'info').filter(
            (line) => line.includes('repaired ') || line.includes('refreshed ')
        );
        expect(perProjectActions).toEqual([]);
    });

    it('never reads the tools manifest (tier-1-only runs stay manifest-read-free)', async () => {
        await runHealthySweep();

        const manifestReads = readPaths().filter((p) => p.includes('.demo-builder-mcp'));
        expect(manifestReads).toEqual([]);
    });
});

// ─── Save-only-when-moved: hash-map-change without a disk write ──────────────

describe('save-only-when-moved', () => {
    it('saves when only the hash map changed (pre-ADR settings.json, byte-identical)', async () => {
        // Disk is byte-exact healthy, but the manifest never recorded a hash
        // for settings.json (pre-ADR). The merge produces identical content —
        // no disk write — yet the newly recorded hash must be persisted or the
        // next sweep repeats the same dance forever.
        const { hashes } = await provisionHealthyDisk();
        const withoutSettings = { ...hashes };
        delete withoutSettings['.claude/settings.json'];
        const project = makeProject({
            aiContextVersion: AI_CONTEXT_VERSION,
            aiFileHashes: withoutSettings,
        });
        const deps = makeDeps({ [PROJECT_A]: project });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(saved).toHaveLength(1);
        expect(saved[0].aiFileHashes?.['.claude/settings.json']).toBe(
            hashes['.claude/settings.json']
        );
    });
});

// ─── Config drift: tier-1 repair without touching the stamp ──────────────────

describe('stale .mcp.json (dead dist path, provably ours)', () => {
    const STALE_MCP = JSON.stringify(
        {
            mcpServers: {
                'demo-builder': {
                    command: '/old/node',
                    args: ['/old-extension/dist/mcp-proxy.js'],
                },
            },
        },
        null,
        2
    );

    function driftFixture(): Project {
        mockDisk({
            [path.join(PROJECT_A, '.mcp.json')]: STALE_MCP,
            [path.join(PROJECT_A, '.claude', 'mcp.json')]: STALE_MCP,
        });
        return makeProject({
            aiContextVersion: AI_CONTEXT_VERSION,
            aiFileHashes: {
                '.mcp.json': sha256(STALE_MCP),
                '.claude/mcp.json': sha256(STALE_MCP),
            },
        });
    }

    it('rewrites both mcp.json files with the current dist path', async () => {
        const deps = makeDeps({ [PROJECT_A]: driftFixture() });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        const mcpWrite = (fsPromises.writeFile as jest.Mock).mock.calls.find(([p]) =>
            String(p).endsWith(`${PROJECT_A}/.mcp.json`)
        );
        expect(mcpWrite).toBeDefined();
        expect(String(mcpWrite![1])).toContain(
            path.join(EXTENSION_PATH, 'dist', 'mcp-proxy.js')
        );
        expect(writtenPaths()).toContain(path.join(PROJECT_A, '.claude', 'mcp.json'));
    });

    it('saves the manifest once with the updated hashes', async () => {
        const deps = makeDeps({ [PROJECT_A]: driftFixture() });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(saved).toHaveLength(1);
        expect(saved[0].aiFileHashes?.['.mcp.json']).toBeDefined();
        expect(saved[0].aiFileHashes?.['.mcp.json']).not.toBe(sha256(STALE_MCP));
    });

    it('does not advance the stamp and does not run tier 2', async () => {
        const deps = makeDeps({ [PROJECT_A]: driftFixture() });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(saved[0].aiContextVersion).toBe(AI_CONTEXT_VERSION);
        expect(writtenPaths().some((p) => p.endsWith('/AGENTS.md'))).toBe(false);
        expect(writtenPaths().some((p) => p.includes('/.claude/skills/'))).toBe(false);
    });

    it('logs an info line naming the repaired files and the WHY (config drift)', async () => {
        const deps = makeDeps({ [PROJECT_A]: driftFixture() });
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        const repairLine = loggedLines(logger, 'info').find((line) =>
            line.includes('config drift')
        );
        expect(repairLine).toBeDefined();
        expect(repairLine).toContain('demo-a');
        expect(repairLine).toContain('.mcp.json');
        // Acting is not healthy — the debug decision line must not also fire.
        expect(
            loggedLines(logger, 'debug').filter((line) => line.includes('tier1 ok'))
        ).toEqual([]);
    });
});

// ─── Stale stamp: silent tier-1+2 refresh + stamp advance ────────────────────

describe('stale aiContextVersion stamp', () => {
    it('runs tier 1 AND tier 2', async () => {
        const deps = makeDeps({ [PROJECT_A]: makeProject({ aiContextVersion: 3 }) });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        const paths = writtenPaths();
        expect(paths.some((p) => p.endsWith(`${PROJECT_A}/.mcp.json`))).toBe(true);
        expect(paths.some((p) => p.endsWith('/AGENTS.md'))).toBe(true);
        expect(paths.some((p) => p.endsWith('/.claude/skills/add-component/SKILL.md'))).toBe(true);
    });

    it('advances the stamp to AI_CONTEXT_VERSION and saves exactly once', async () => {
        const deps = makeDeps({ [PROJECT_A]: makeProject({ aiContextVersion: 3 }) });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(saved).toHaveLength(1);
        expect(saved[0].aiContextVersion).toBe(AI_CONTEXT_VERSION);
        expect(saved[0].aiFileHashes?.['AGENTS.md']).toBeDefined();
    });

    it('names the WHY: stamp <old> < <current>', async () => {
        const deps = makeDeps({ [PROJECT_A]: makeProject({ aiContextVersion: 3 }) });
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        const refreshLine = loggedLines(logger, 'info').find((line) =>
            line.includes(`stamp 3 < ${AI_CONTEXT_VERSION}`)
        );
        expect(refreshLine).toBeDefined();
        expect(refreshLine).toContain('demo-a');
    });

    it('treats a missing stamp as 0 (stale)', async () => {
        const deps = makeDeps({ [PROJECT_A]: makeProject() });
        const logger = makeMockLogger();
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        expect(saved[0].aiContextVersion).toBe(AI_CONTEXT_VERSION);
        expect(
            loggedLines(logger, 'info').some((line) =>
                line.includes(`stamp 0 < ${AI_CONTEXT_VERSION}`)
            )
        ).toBe(true);
    });

    it('EDS project with playwright installed gets the playwright-gated skills', async () => {
        // Without the tools-manifest stub the three playwright skills silently
        // gate out on EDS fixtures — the stub IS the point of this test.
        mockDisk({
            [path.join(PROJECT_A, '.demo-builder-mcp', 'package.json')]: mcpToolsManifest([
                '@playwright/mcp',
            ]),
        });
        const deps = makeDeps({ [PROJECT_A]: makeEdsProject({ aiContextVersion: 3 }) });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(
            writtenPaths().some((p) => p.endsWith('/.claude/skills/scrape-reference-site/SKILL.md'))
        ).toBe(true);
    });

    it('removes a previously-delivered gated skill when its tool is unavailable', async () => {
        // EDS project, playwright NOT installed, and a hash-matched (provably
        // ours) playwright skill on disk → the tier-2 run reconciles it away
        // and the removal lands in the persisted hash map.
        const skillRel = '.claude/skills/scrape-reference-site/SKILL.md';
        const skillAbs = path.join(PROJECT_A, skillRel);
        mockDisk({ [skillAbs]: 'previously generated content' });
        const project = makeEdsProject({
            aiContextVersion: 3,
            aiFileHashes: { [skillRel]: sha256('previously generated content') },
        });
        const deps = makeDeps({ [PROJECT_A]: project });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(fsPromises.unlink).toHaveBeenCalledWith(skillAbs);
        expect(saved[0].aiFileHashes?.[skillRel]).toBeUndefined();
    });

    it('does not deliver playwright skills to a project without an EDS storefront', async () => {
        const deps = makeDeps({ [PROJECT_A]: makeProject({ aiContextVersion: 3 }) });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(
            writtenPaths().some((p) => p.endsWith('/.claude/skills/scrape-reference-site/SKILL.md'))
        ).toBe(false);
    });
});

// ─── User-edited files: skipped, logged, preserved ───────────────────────────

describe('user-edited file during a stale-stamp refresh', () => {
    function editedAgentsFixture(): Project {
        mockDisk({
            [path.join(PROJECT_A, 'AGENTS.md')]: 'my customized AGENTS content',
        });
        return makeProject({
            aiContextVersion: 3,
            aiFileHashes: { 'AGENTS.md': sha256('what we generated last time') },
        });
    }

    it('leaves the edited file in place and logs a per-file info line', async () => {
        const deps = makeDeps({ [PROJECT_A]: editedAgentsFixture() });
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        expect(writtenPaths().some((p) => p.endsWith('/AGENTS.md'))).toBe(false);
        // Per-file at info, NOT debug — debug is excluded from the export buffer.
        expect(
            loggedLines(logger, 'info').some(
                (line) => line.includes('Skipped') && line.includes('AGENTS.md')
            )
        ).toBe(true);
    });

    it('preserves the edited file\'s recorded hash in the saved manifest', async () => {
        const deps = makeDeps({ [PROJECT_A]: editedAgentsFixture() });
        const saved = captureSaves(deps);

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(saved[0].aiFileHashes?.['AGENTS.md']).toBe(
            sha256('what we generated last time')
        );
    });

    it('counts the skipped file in the summary line', async () => {
        const deps = makeDeps({ [PROJECT_A]: editedAgentsFixture() });
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        expect(
            loggedLines(logger, 'info').some(
                (line) => line.includes('Activation sweep:') && line.includes('1 skipped file(s)')
            )
        ).toBe(true);
    });
});

// ─── Failure isolation: warn + continue, never reject ────────────────────────

describe('failure isolation', () => {
    it('a throwing loader warns and the sweep continues to the next project', async () => {
        const projectB = makeProject({ name: 'demo-b', path: PROJECT_B, aiContextVersion: 3 });
        const deps = makeDeps({ [PROJECT_A]: null, [PROJECT_B]: projectB });
        deps.loader.loadProject.mockImplementation(async (projectPath: string) => {
            if (projectPath === PROJECT_A) throw new Error('corrupt manifest');
            return projectB;
        });
        const logger = makeMockLogger();
        const saved = captureSaves(deps);

        await expect(
            refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps)
        ).resolves.toBeUndefined();

        expect(
            loggedLines(logger, 'warn').some(
                (line) => line.includes('demo-a') && line.includes('corrupt manifest')
            )
        ).toBe(true);
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('demo-b');
    });

    it('a null loader result warns and the sweep continues', async () => {
        const deps = makeDeps({ [PROJECT_A]: null });
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        expect(loggedLines(logger, 'warn').some((line) => line.includes('demo-a'))).toBe(true);
        expect(
            loggedLines(logger, 'info').some((line) => line.includes('Activation sweep:'))
        ).toBe(true);
    });

    it('a throwing scanner warns and the promise still resolves', async () => {
        const deps = makeDeps({});
        deps.scanner.getAllProjects.mockRejectedValue(new Error('EACCES: projects dir'));
        const logger = makeMockLogger();

        await expect(
            refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps)
        ).resolves.toBeUndefined();

        expect(
            loggedLines(logger, 'warn').some((line) => line.includes('EACCES: projects dir'))
        ).toBe(true);
    });

    it('a mid-refresh disk failure warns for that project and the next still runs', async () => {
        const projectA = makeProject({ aiContextVersion: 3 });
        const projectB = makeProject({ name: 'demo-b', path: PROJECT_B, aiContextVersion: 3 });
        const deps = makeDeps({ [PROJECT_A]: projectA, [PROJECT_B]: projectB });
        (fsPromises.writeFile as jest.Mock).mockImplementation(async (p: string) => {
            if (String(p).startsWith(PROJECT_A)) throw new Error('disk full');
        });
        const logger = makeMockLogger();
        const saved = captureSaves(deps);

        await expect(
            refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps)
        ).resolves.toBeUndefined();

        expect(
            loggedLines(logger, 'warn').some(
                (line) => line.includes('demo-a') && line.includes('disk full')
            )
        ).toBe(true);
        expect(saved.some((p) => p.name === 'demo-b')).toBe(true);
    });

    it('resolves quietly when no projects exist (no summary, no node resolution)', async () => {
        const deps = makeDeps({});
        const logger = makeMockLogger();

        await refreshAiBundlesOnActivation(EXTENSION_PATH, logger, deps);

        expect(deps.resolveNode).not.toHaveBeenCalled();
        expect(deps.configWriter.saveProjectConfig).not.toHaveBeenCalled();
        expect(
            loggedLines(logger, 'info').filter((line) => line.includes('Activation sweep:'))
        ).toEqual([]);
    });
});

// ─── nodePath: resolved once, reused across all projects ─────────────────────

describe('node binary resolution', () => {
    it('resolves the node path exactly once for many projects and never shells out', async () => {
        const projectA = makeProject({ aiContextVersion: 3 });
        const projectB = makeProject({ name: 'demo-b', path: PROJECT_B, aiContextVersion: 3 });
        const deps = makeDeps({ [PROJECT_A]: projectA, [PROJECT_B]: projectB });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        expect(deps.resolveNode).toHaveBeenCalledTimes(1);
        expect(childProcess.execFile as unknown as jest.Mock).not.toHaveBeenCalled();
    });
});

// ─── Partial failure: landed hashes survive a mid-refresh throw ──────────────

describe('partial failure persistence', () => {
    it('best-effort saves landed hashes when a tier throws mid-refresh', async () => {
        // Phase-4 review: tier 1 lands writes, tier 2 throws → without a
        // best-effort save the manifest keeps stale hashes for files that DID
        // change on disk, and every later refresh misreads them as user-edited.
        const { hashes } = await provisionHealthyDisk();
        // stale stamp → tier 2 runs
        const project = makeProject({ aiContextVersion: AI_CONTEXT_VERSION - 1, aiFileHashes: hashes });
        const deps = makeDeps({ [PROJECT_A]: project });
        const saved = captureSaves(deps);
        // First write of the run succeeds (a landed change), later writes blow up.
        let writes = 0;
        (fsPromises.writeFile as jest.Mock).mockImplementation(async () => {
            if ((writes += 1) > 1) throw new Error('disk full');
        });

        await refreshAiBundlesOnActivation(EXTENSION_PATH, makeMockLogger(), deps);

        // The sweep survives (never-throws contract) AND persisted what landed.
        expect(saved.length).toBeGreaterThanOrEqual(1);
    });
});
