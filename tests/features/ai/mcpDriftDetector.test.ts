/**
 * detectMcpDrift tests — the cheap, network-free P1-safe probe behind the
 * mcp-health on-open check. Reads `<project>/.claude/mcp.json` and verifies each
 * declared server's filesystem args resolve on disk (fs.access only; no spawn,
 * no fetch). Missing/malformed file → not drift (that's AI-not-setup, not stale
 * paths). The extension-managed `demo-builder` proxy is skipped.
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { detectMcpDrift } from '@/features/ai/mcpDriftDetector';

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    access: jest.fn(),
}));

const PROJECT = '/proj';
const TOOLS_DIR = path.join(PROJECT, '.demo-builder-mcp');

const readFile = fsPromises.readFile as jest.Mock;
const access = fsPromises.access as jest.Mock;

/** Mock `.claude/mcp.json` contents. */
function mockMcpJson(
    servers: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>
) {
    readFile.mockResolvedValue(JSON.stringify({ mcpServers: servers }));
}

/** `fs.access` resolves for paths in `existing`, rejects (ENOENT) otherwise. */
function existsOnly(existing: string[]) {
    const set = new Set(existing);
    access.mockImplementation((p: string) =>
        set.has(p)
            ? Promise.resolve()
            : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    );
}

beforeEach(() => {
    jest.clearAllMocks();
    access.mockResolvedValue(undefined);
});

it('healthy: all server arg paths exist → not drifted', async () => {
    mockMcpJson({
        'commerce-extensibility': { command: 'node', args: ['node_modules/x/cli.js'] },
        playwright: { command: 'node', args: ['@playwright/mcp/index.js'] },
    });
    existsOnly([
        path.join(TOOLS_DIR, 'node_modules/x/cli.js'),
        path.join(TOOLS_DIR, '@playwright/mcp/index.js'),
    ]);

    const result = await detectMcpDrift(PROJECT);

    expect(result).toEqual({ drifted: false, missing: [] });
});

it('drifted: a missing arg path is reported', async () => {
    mockMcpJson({ playwright: { command: 'node', args: ['@playwright/mcp/index.js'] } });
    existsOnly([]); // nothing exists

    const result = await detectMcpDrift(PROJECT);

    expect(result.drifted).toBe(true);
    expect(result.missing).toContain(path.join(TOOLS_DIR, '@playwright/mcp/index.js'));
});

it('CHECKS the demo-builder entry — it is the one that rots on update', async () => {
    // Reversed 2026-08-13. This used to assert the opposite, on the reasoning
    // that the entry is "extension-managed". The extension writes it and never
    // re-writes it, so managed meant written once and forgotten: both writers
    // embed the VERSIONED dist path, and a colleague's CLI ended up refusing to
    // add any MCP server because user and project scope named different builds.
    //
    // The fixture is absolute because that is what both writers emit
    // (`path.join(extensionDistPath, 'mcp-proxy.js')`).
    const stale = '/ext/skukla.adobe-demo-builder-1.0.0-beta.111/dist/mcp-proxy.js';
    mockMcpJson({ 'demo-builder': { command: 'node', args: [stale] } });
    existsOnly([]); // the version it names is gone

    const result = await detectMcpDrift(PROJECT);

    expect(result.drifted).toBe(true);
    expect(result.missing).toEqual([stale]);
});

it('ignores a RELATIVE arg on the demo-builder entry rather than guessing', async () => {
    // Our writers always emit absolute. A relative arg is not something we wrote,
    // and resolving it against the PROJECT's tools dir would invent a path that
    // was never going to exist and report it as drift.
    mockMcpJson({ 'demo-builder': { command: 'node', args: ['dist/mcp-proxy.js'] } });
    existsOnly([]);

    expect(await detectMcpDrift(PROJECT)).toEqual({ drifted: false, missing: [] });
});

it('resolves a relative arg against the MCP tools dir (not cwd)', async () => {
    mockMcpJson({ playwright: { command: 'node', args: ['@playwright/mcp/index.js'] } });
    existsOnly([path.join(TOOLS_DIR, '@playwright/mcp/index.js')]);

    await detectMcpDrift(PROJECT);

    expect(access).toHaveBeenCalledWith(path.join(TOOLS_DIR, '@playwright/mcp/index.js'));
});

it('stats an absolute arg as-is (a stale cross-project path → drift)', async () => {
    const stalePath = '/old/project/.demo-builder-mcp/node_modules/x/cli.js';
    mockMcpJson({ 'commerce-extensibility': { command: 'node', args: [stalePath] } });
    existsOnly([]); // stale absolute path doesn't exist here

    const result = await detectMcpDrift(PROJECT);

    expect(access).toHaveBeenCalledWith(stalePath);
    expect(result.drifted).toBe(true);
    expect(result.missing).toContain(stalePath);
});

it('missing .mcp.json → not drifted (AI-not-setup, not stale paths)', async () => {
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await detectMcpDrift(PROJECT);

    expect(result).toEqual({ drifted: false, missing: [] });
    expect(access).not.toHaveBeenCalled();
});

it('malformed .mcp.json → degrades to not drifted (no throw)', async () => {
    readFile.mockResolvedValue('{ not valid json');

    const result = await detectMcpDrift(PROJECT);

    expect(result).toEqual({ drifted: false, missing: [] });
});

it('server with env-only / non-path args → not drifted (nothing to stat)', async () => {
    mockMcpJson({
        'env-only': { command: 'node', env: { FOO: 'bar' } },
        'flag-args': { command: 'node', args: ['--port', '8080'] },
    });

    const result = await detectMcpDrift(PROJECT);

    expect(result).toEqual({ drifted: false, missing: [] });
    expect(access).not.toHaveBeenCalled();
});
