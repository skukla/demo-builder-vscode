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
    installAiDefaultsMcpTools,
    resolveMcpToolsDir,
} from '@/features/project-creation/services/aiDefaultsInstaller';
import { ServiceLocator } from '@/core/di/serviceLocator';

jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
}));

const executeMock = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: jest.fn(() => ({ execute: executeMock })),
    },
}));

const PROJECT_PATH = '/projects/test';
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

        await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(fsPromises.mkdir).toHaveBeenCalledWith(TOOLS_DIR, { recursive: true });
    });

    it('writes a package.json into the isolated dir (not the storefront)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(fsPromises.writeFile).toHaveBeenCalledWith(
            TOOLS_PACKAGE_JSON_PATH,
            expect.any(String),
            'utf-8',
        );
    });

    it('declares dependencies equal to exactly the ai-defaults packages', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH);

        const pkg = captureToolsPackageJson();
        const deps = pkg?.dependencies as Record<string, string> | undefined;
        // ai-defaults.json ships the Adobe App Builder MCP and Playwright MCP.
        expect(deps).toEqual({
            '@adobe-commerce/commerce-extensibility-tools': '^3.4.0',
            '@playwright/mcp': '^0.0.75',
        });
    });

    it('marks the tools package.json private with a stable name', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH);

        const pkg = captureToolsPackageJson();
        expect(pkg?.name).toBe('demo-builder-mcp-tools');
        expect(pkg?.private).toBe(true);
        expect(pkg?.version).toBe('1.0.0');
    });

    it('does NOT declare any storefront dependency (decoupled from the storefront manifest)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        await installAiDefaultsMcpTools(PROJECT_PATH);

        const pkg = captureToolsPackageJson();
        const deps = pkg?.dependencies as Record<string, string> | undefined;
        // The b2b @dropins packages that break the storefront install must never
        // appear here — only the public MCP tool packages.
        expect(Object.keys(deps ?? {})).not.toContain('@dropins/storefront-pdp');
        expect(pkg?.devDependencies).toBeUndefined();
    });

    it('runs npm install with cwd = the isolated dir (NOT the storefront)', async () => {
        executeMock.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(ServiceLocator.getCommandExecutor).toHaveBeenCalledTimes(1);
        expect(executeMock).toHaveBeenCalledWith(
            'npm install',
            expect.objectContaining({ cwd: TOOLS_DIR }),
        );
        expect(result).toEqual({ success: true });
    });

    it('reports failure with a clear error when npm install exits non-zero', async () => {
        executeMock.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'npm ERR! 404 Not Found - @some/package',
        });

        const result = await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm install/);
        expect(result.error).toMatch(/code 1/);
        expect(result.error).toMatch(/404 Not Found/);
    });

    it('reports failure when the command executor throws', async () => {
        executeMock.mockRejectedValue(new Error('ENOENT: npm not found'));

        const result = await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/npm not found/);
    });

    it('reports failure when writing the tools package.json throws', async () => {
        (fsPromises.writeFile as jest.Mock).mockRejectedValueOnce(
            new Error('EACCES: permission denied'),
        );

        const result = await installAiDefaultsMcpTools(PROJECT_PATH);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/EACCES/);
        // npm install must NOT run if the prep step failed.
        expect(executeMock).not.toHaveBeenCalled();
    });
});
