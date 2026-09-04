/**
 * AI Defaults Installer Tests
 *
 * The MCP tool packages declared in `ai-defaults.json` install into a
 * per-project isolated directory (`<project>/.demo-builder-mcp/`) — decoupled
 * from the storefront's `package.json`. The storefront's own `npm install` can
 * fail (b2b feature pack injects 404-on-public-npm dropins), so the public MCP
 * tool packages must never ride on it.
 *
 * Verifies that `installAiDefaultsMcpTools(projectPath)`:
 *   - Creates `<projectPath>/.demo-builder-mcp/` and writes a package.json whose
 *     `dependencies` are exactly the ai-defaults packages (NOT storefront deps)
 *   - Runs `npm install` with cwd = `<projectPath>/.demo-builder-mcp`
 *   - Returns a structured failure when npm install exits non-zero / throws
 * and that `resolveMcpToolsDir` points at the isolated dir.
 */

import * as fsPromises from 'fs/promises';
import {
    applicableMcpPackages,
    installAiDefaultsMcpTools,
    readInstalledMcpPackages,
    resolveMcpToolsDir,
} from '@/features/project-creation/services/aiBundle/aiDefaultsInstaller';
import { COMPONENT_IDS } from '@/core/constants';
import type { ExecuteOptions } from '@/core/shell/types';
import { createMockProject } from '../../../../helpers/projectFake';
import { createMockCommandExecutor } from '../../../../helpers/commandExecutorFake';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
}));

const executeMock = jest.fn();
/**
 * CONVERTED 2026-08-28 (ADR-015): the executor is handed IN, so this suite no
 * longer mocks the service registry — the fake is a plain object.
 */
const executor = createMockCommandExecutor({ execute: executeMock });

const PROJECT_PATH = '/projects/test';
// EDS storefront project — both ai-defaults entries apply (Developer Agent
// tooling AND Playwright).
const EDS_PROJECT = createMockProject({
    name: 'Test',
    path: PROJECT_PATH,
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: { id: COMPONENT_IDS.EDS_STOREFRONT, name: 'EDS Storefront', status: 'ready', path: `${PROJECT_PATH}/components/eds-storefront` },
    },
});
// Mesh-only project — only 'app-builder-tooling' entries apply.
const MESH_PROJECT = createMockProject({
    name: 'Test',
    path: PROJECT_PATH,
    componentInstances: {
        [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: { id: COMPONENT_IDS.HEADLESS_COMMERCE_MESH, name: 'EDS Storefront', status: 'ready', path: `${PROJECT_PATH}/components/mesh` },
    },
});
// Bare project — nothing applies; the installer no-ops.
const BARE_PROJECT = createMockProject({ name: 'Test', path: PROJECT_PATH });
const TOOLS_DIR = `${PROJECT_PATH}/.demo-builder-mcp`;
const TOOLS_PACKAGE_JSON_PATH = `${TOOLS_DIR}/package.json`;

function captureToolsPackageJson(): Record<string, unknown> | undefined {
    const writeMock = fsPromises.writeFile as jest.Mock;
    const call = writeMock.mock.calls.find(([p]: [string]) => p === TOOLS_PACKAGE_JSON_PATH);
    if (!call) return undefined;
    return JSON.parse(call[1] as string) as Record<string, unknown>;
}

describe('resolveMcpToolsDir', () => {
    it('points at the per-project isolated .demo-builder-mcp directory', () => {
        expect(resolveMcpToolsDir(PROJECT_PATH)).toBe(TOOLS_DIR);
    });

    it('anchors to the project root, not any storefront path', () => {
        const dir = resolveMcpToolsDir('/some/other/project');
        expect(dir).toBe('/some/other/project/.demo-builder-mcp');
        expect(dir).not.toContain('components');
        expect(dir).not.toContain('eds-storefront');
    });
});

describe('installAiDefaultsMcpTools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
    });

    it('creates the isolated .demo-builder-mcp directory (recursive)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(fsPromises.mkdir).toHaveBeenCalledWith(TOOLS_DIR, { recursive: true });
    });

    it('writes a package.json into the isolated dir (not the storefront)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            TOOLS_PACKAGE_JSON_PATH,
            expect.any(String),
            'utf-8'
        );
    });

    it('declares dependencies equal to exactly the ai-defaults packages', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        const pkg = captureToolsPackageJson();
        const deps = pkg?.dependencies as Record<string, string> | undefined;
        // ai-defaults.json ships the Adobe App Builder MCP, Playwright MCP, and
        // (for EDS storefronts) the Adobe dropins MCP. Playwright is a TILDE
        // range on purpose: for 0.0.x versions a caret is an exact pin.
        expect(deps).toEqual({
            '@adobe-commerce/commerce-extensibility-tools': '^3.4.0',
            '@playwright/mcp': '~0.0.79',
            '@dropins/mcp': '^1.1.2',
        });
    });

    it('marks the tools package.json private with a stable name', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        const pkg = captureToolsPackageJson();
        expect(pkg?.name).toBe('demo-builder-mcp-tools');
        expect(pkg?.private).toBe(true);
        expect(pkg?.version).toBe('1.0.0');
    });

    it('does NOT declare any storefront dependency (decoupled from the storefront manifest)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        const pkg = captureToolsPackageJson();
        const deps = pkg?.dependencies as Record<string, string> | undefined;
        // The b2b @dropins packages that break the storefront install must never
        // appear here — only the public MCP tool packages.
        expect(Object.keys(deps ?? {})).not.toContain('@dropins/storefront-pdp');
        expect(pkg?.devDependencies).toBeUndefined();
    });

    it('installs only the Developer Agent tooling for a mesh-only project (no Playwright)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, MESH_PROJECT, executor);

        const pkg = captureToolsPackageJson();
        const deps = pkg?.dependencies as Record<string, string> | undefined;
        expect(deps).toEqual({
            '@adobe-commerce/commerce-extensibility-tools': '^3.4.0',
        });
    });

    it('no-ops (success, no npm run) when no ai-defaults entry applies', async () => {
        const result = await installAiDefaultsMcpTools(PROJECT_PATH, BARE_PROJECT, executor);

        expect(result).toEqual({ success: true });
        expect(fsPromises.writeFile).not.toHaveBeenCalled();
        expect(executeMock).not.toHaveBeenCalled();
    });

    it('runs npm install with cwd = the isolated dir (NOT the storefront)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        // The install runs exactly once, through the handed-in executor.
        expect(executeMock).toHaveBeenCalledTimes(1);
        expect(executeMock).toHaveBeenCalledWith(
            'npm install',
            expect.objectContaining({ cwd: TOOLS_DIR })
        );
        expect(result).toEqual({ success: true });
    });

    it('reports failure with a clear error when npm install exits non-zero', async () => {
        executeMock.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'npm ERR! 404 Not Found - @some/package',
        });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm install/);
        expect(result.error).toMatch(/code 1/);
        expect(result.error).toMatch(/404 Not Found/);
    });

    it('reports failure when the command executor throws', async () => {
        executeMock.mockRejectedValue(new Error('ENOENT: npm not found'));

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm not found/);
    });

    it('reports failure when writing the tools package.json throws', async () => {
        (fsPromises.writeFile as jest.Mock).mockRejectedValueOnce(
            new Error('EACCES: permission denied')
        );

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/EACCES/);
        // npm install must NOT run if the prep step failed.
        expect(executeMock).not.toHaveBeenCalled();
    });
});

// =============================================================================
// The composition-axis readers (aiContextFreshnessCheck compares these two).
// =============================================================================

describe('applicableMcpPackages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
    });

    it('names the Developer Agent package for a mesh-only project', () => {
        const pkgs = applicableMcpPackages(MESH_PROJECT);
        expect(pkgs).toContain('@adobe-commerce/commerce-extensibility-tools');
    });

    it('returns every entry for an EDS storefront project (superset of mesh-only)', () => {
        const eds = applicableMcpPackages(EDS_PROJECT);
        const mesh = applicableMcpPackages(MESH_PROJECT);
        for (const pkg of mesh) expect(eds).toContain(pkg);
        expect(eds.length).toBeGreaterThanOrEqual(mesh.length);
    });

    it('returns nothing for a bare project', () => {
        expect(applicableMcpPackages(BARE_PROJECT)).toEqual([]);
    });

    it('agrees with what the installer would install (the two must not drift)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        await installAiDefaultsMcpTools(PROJECT_PATH, MESH_PROJECT, executor);
        const manifest = captureToolsPackageJson();
        expect(Object.keys((manifest?.dependencies as object) ?? {}).sort()).toEqual(
            applicableMcpPackages(MESH_PROJECT).sort()
        );
    });
});

describe('installAiDefaultsMcpTools — npm output reaches a channel', () => {
    // Regression, 2026-09-02: npm's output was read ONLY on a non-zero exit, and
    // npm exits 0 on a warning. An EBADENGINE (a package declaring a Node range
    // this machine does not satisfy) therefore reached no channel at all — it
    // flashed past on the progress line, which keeps only the last line of a chunk.
    const EBADENGINE = 'npm warn EBADENGINE Unsupported engine {';
    const DEPRECATED = 'npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported';

    let logger: { debug: jest.Mock; warn: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        logger = { debug: jest.fn(), warn: jest.fn() };
    });

    it('raises every npm warning to warn even though npm exited 0', async () => {
        executeMock.mockResolvedValue({
            code: 0,
            stdout: `${EBADENGINE}\nadded 214 packages`,
            stderr: DEPRECATED,
        });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, undefined, logger);

        expect(logger.warn).toHaveBeenCalledWith(`[AI Tools] ${EBADENGINE}`);
        expect(logger.warn).toHaveBeenCalledWith(`[AI Tools] ${DEPRECATED}`);
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('sends the whole output to debug, warning lines included', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: `${EBADENGINE}\nadded 214 packages`, stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, undefined, logger);

        const debugMessage = logger.debug.mock.calls[0][0] as string;
        expect(debugMessage).toContain('2 line(s), 1 warning(s)');
        expect(debugMessage).toContain(EBADENGINE);
        expect(debugMessage).toContain('added 214 packages');
    });

    it('logs nothing when npm said nothing (a clean install is not news)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, undefined, logger);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('still logs the output when npm FAILED, alongside the structured error', async () => {
        executeMock.mockResolvedValue({ code: 1, stdout: EBADENGINE, stderr: 'npm error code E404' });

        const result = await installAiDefaultsMcpTools(
            PROJECT_PATH,
            EDS_PROJECT,
            executor,
            undefined,
            logger
        );

        expect(logger.warn).toHaveBeenCalledWith(`[AI Tools] ${EBADENGINE}`);
        expect(result.success).toBe(false);
        expect(result.error).toContain('npm install exited with code 1');
    });

    it('installs without a logger (the parameter is optional, not required)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: EBADENGINE, stderr: '' });

        await expect(
            installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor)
        ).resolves.toEqual({ success: true });
    });
});

describe('readInstalledMcpPackages', () => {
    it('reads the dependency names from the isolated tools manifest', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce(
            JSON.stringify({ dependencies: { 'pkg-a': '^1.0.0', 'pkg-b': '^2.0.0' } })
        );

        await expect(readInstalledMcpPackages(PROJECT_PATH)).resolves.toEqual(['pkg-a', 'pkg-b']);
        expect(fsPromises.readFile).toHaveBeenCalledWith(TOOLS_PACKAGE_JSON_PATH, 'utf-8');
    });

    it('reads as [] when the manifest is absent (nothing installed — can only cause a warning, never mask one)', async () => {
        await expect(readInstalledMcpPackages(PROJECT_PATH)).resolves.toEqual([]);
    });

    it('reads as [] when the manifest is unparseable', async () => {
        (fsPromises.readFile as jest.Mock).mockResolvedValueOnce('not json');
        await expect(readInstalledMcpPackages(PROJECT_PATH)).resolves.toEqual([]);
    });
});

// =============================================================================
// What the installer HANDS the executor, and what it does with what comes back.
// A mock answers the same whatever it is passed, so the options object and the
// streaming callback are asserted as ARGUMENTS — nothing else can see them.
// =============================================================================

/** The options object the installer handed `execute` on its only call. */
function capturedExecuteOptions(): ExecuteOptions {
    expect(executeMock).toHaveBeenCalledTimes(1);
    return executeMock.mock.calls[0][1] as ExecuteOptions;
}

describe('installAiDefaultsMcpTools — the npm execute options', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    });

    it('asks for an enhanced PATH so npm resolves outside a login shell', async () => {
        // The extension host does not inherit the SC's shell PATH; without this
        // the install fails with "npm: command not found" on a machine that has npm.
        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(capturedExecuteOptions().enhancePath).toBe(true);
    });

    it('does NOT ask for streaming when no progress callback is supplied', async () => {
        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        const options = capturedExecuteOptions();
        expect(options.streaming).toBeUndefined();
        expect(options.onOutput).toBeUndefined();
    });

    it('asks for streaming and hands over a sink when a progress callback IS supplied', async () => {
        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, jest.fn());

        const options = capturedExecuteOptions();
        expect(options.streaming).toBe(true);
        expect(typeof options.onOutput).toBe('function');
    });
});

describe('installAiDefaultsMcpTools — the progress stream', () => {
    let onProgress: jest.Mock;

    /** Run the installer with a progress callback and return the sink it handed over. */
    async function sink(): Promise<(data: string) => void> {
        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, onProgress);
        const forward = capturedExecuteOptions().onOutput;
        if (!forward) throw new Error('no onOutput was handed to the executor');
        return forward;
    }

    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
        onProgress = jest.fn();
    });

    it('forwards the LAST line of a chunk, trimmed', async () => {
        // npm writes in chunks, not lines; the progress line has room for one, so
        // the newest is the one worth showing.
        (await sink())('added 1 package\n  reify:glob: timing  \n');

        expect(onProgress).toHaveBeenCalledTimes(1);
        expect(onProgress).toHaveBeenCalledWith('reify:glob: timing');
    });

    it('forwards a single-line chunk as itself', async () => {
        (await sink())('added 214 packages in 12s');

        expect(onProgress).toHaveBeenCalledWith('added 214 packages in 12s');
    });

    it('says nothing for a whitespace-only chunk', async () => {
        // An empty progress line would blank the step title for no reason.
        (await sink())('   \n  \n');

        expect(onProgress).not.toHaveBeenCalled();
    });
});

describe('installAiDefaultsMcpTools — the failure message the SC sees', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
    });

    it('trims the stderr tail onto the exit-code line', async () => {
        executeMock.mockResolvedValue({ code: 1, stdout: '', stderr: 'npm ERR! boom\n' });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.error).toBe('npm install exited with code 1: npm ERR! boom');
    });

    it('reports the exit code alone when stderr is empty (no dangling colon)', async () => {
        executeMock.mockResolvedValue({ code: 7, stdout: 'added 0 packages', stderr: '   ' });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.error).toBe('npm install exited with code 7');
    });

    it('keeps only the TAIL of a long stderr (the modal is not a log viewer)', async () => {
        const head = `HEAD-MARKER${'x'.repeat(900)}`;
        executeMock.mockResolvedValue({ code: 1, stdout: '', stderr: `${head}TAIL-MARKER` });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result.error).toContain('TAIL-MARKER');
        expect(result.error).not.toContain('HEAD-MARKER');
        // The exit-code preamble plus at most the 500-byte tail.
        expect(result.error?.length).toBeLessThan(600);
    });

    it('reports a thrown Error by its message alone, with no "Error:" prefix', async () => {
        executeMock.mockRejectedValue(new Error('ENOENT: npm not found'));

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result).toEqual({ success: false, error: 'ENOENT: npm not found' });
    });

    it('reports a thrown NON-Error by its string form', async () => {
        // execa can reject with a non-Error; `err.message` would be undefined and the
        // modal would show nothing at all.
        executeMock.mockRejectedValue('npm exploded');

        const result = await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor);

        expect(result).toEqual({ success: false, error: 'npm exploded' });
    });
});

describe('installAiDefaultsMcpTools — which lines count as npm warnings', () => {
    let logger: { debug: jest.Mock; warn: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        executeMock.mockReset();
        logger = { debug: jest.fn(), warn: jest.fn() };
    });

    it('says nothing at all when npm printed only whitespace', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '   \n  ', stderr: '  ' });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, undefined, logger);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).not.toHaveBeenCalled();
    });

    it('raises only lines that START with npm’s warning prefix', async () => {
        // A line that merely QUOTES the prefix is not itself a warning — raising it
        // would put an error line on the warn channel twice over.
        executeMock.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'npm error Command failed: grep "npm warn" install.log',
        });

        await installAiDefaultsMcpTools(PROJECT_PATH, EDS_PROJECT, executor, undefined, logger);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.debug).toHaveBeenCalledTimes(1);
    });
});
