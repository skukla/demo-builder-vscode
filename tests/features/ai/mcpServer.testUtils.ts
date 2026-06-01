/**
 * MCP Server test utilities
 *
 * Shared jest.mock setup (fs/promises, fs, child_process), the `@/mcp-server`
 * import, fixtures, and manifest helpers for the MCP server suite, which is
 * split into per-tool files:
 *   - mcpServer-projects.test.ts  (resolveProjectPath, listProjects, getProject, getComponentConfig)
 *   - mcpServer-config.test.ts    (updateProjectConfig, validateEnvContent)
 *   - mcpServer-blocks.test.ts    (syncStorefront, listBlocks, getBlockSource)
 *
 * The jest.mock calls live here (hoisted above the `@/mcp-server` import) so
 * every sibling shares one mocked filesystem; the mocked module namespaces are
 * re-exported so tests can script per-case behavior.
 */

import * as fsProm from 'fs/promises';
import * as fsSync from 'fs';
import * as childProcess from 'child_process';
import * as path from 'path';

// Mock fs/promises module (covers `import * as fsPromises from 'fs/promises'`)
// Note: jest.clearAllMocks() (called in beforeEach) resets call history and return values for
// mocks created with jest.fn() — but it does NOT remove factory-level default implementations
// set here (e.g. stat resolves to { size: 0 }, realpath is identity). Tests that need different
// behavior override with mockResolvedValueOnce/mockRejectedValueOnce, which take precedence for
// one call and then fall back to the factory default on subsequent calls.
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn().mockResolvedValue({ size: 0 }), // default: .git exists, size 0 (below MAX_FILE_BYTES)
    // realpath: identity by default — all test paths are treated as their own real path
    realpath: jest.fn().mockImplementation((p: string) => Promise.resolve(p)),
}));

// Mock synchronous fs for assertPathInsideSync used by resolveProjectPath
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p), // identity by default
}));

jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

import { toolHandlers, validateEnvContent, resolveProjectPath, registerProjectTools } from '@/mcp-server';

export { fsProm, fsSync, childProcess, path, toolHandlers, validateEnvContent, resolveProjectPath, registerProjectTools };

export const PROJECTS_DIR = '/projects';
export const PROJECT_NAME = 'my-project';
export const PROJECT_PATH = path.join(PROJECTS_DIR, PROJECT_NAME);
export const STOREFRONT_PATH = path.join(PROJECT_PATH, 'components', 'eds-storefront');

/** Helper: mock manifest read to return a project with EDS storefront */
export function mockManifestWithStorefront(storefrontPath: string = STOREFRONT_PATH): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {
            'eds-storefront': { path: storefrontPath },
        },
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}

/** Helper: mock manifest read to return a project without EDS storefront */
export function mockManifestWithoutStorefront(): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {},
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}

/** Helper: mock manifest with EDS storefront AND installed block libraries */
export function mockManifestWithBlockLibraries(
    libraries: Array<{ name: string; source: { owner: string; repo: string; branch?: string }; blockIds: string[] }>,
    storefrontPath: string = STOREFRONT_PATH,
): void {
    const manifest = {
        name: 'my-project',
        status: 'ready',
        componentInstances: {
            'eds-storefront': { path: storefrontPath },
        },
        installedBlockLibraries: libraries.map(lib => ({
            ...lib,
            commitSha: 'abc123',
            installedAt: '2026-01-01T00:00:00Z',
        })),
    };
    (fsProm.readFile as jest.Mock).mockImplementation((p: string) => {
        if (String(p).endsWith('.demo-builder.json')) {
            return Promise.resolve(JSON.stringify(manifest));
        }
        return Promise.reject(new Error(`Unexpected readFile: ${p}`));
    });
}
