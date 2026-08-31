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
import type { Project } from '@/types/base';
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
const EDS_PROJECT = {
    name: 'Test',
    path: PROJECT_PATH,
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: { path: `${PROJECT_PATH}/components/eds-storefront` },
    },
} as unknown as Project;
// Mesh-only project — only 'app-builder-tooling' entries apply.
const MESH_PROJECT = {
    name: 'Test',
    path: PROJECT_PATH,
    componentInstances: {
        [COMPONENT_IDS.HEADLESS_COMMERCE_MESH]: { path: `${PROJECT_PATH}/components/mesh` },
    },
} as unknown as Project;
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
