/**
 * Every tool declares whether it only reads — and callers believe the
 * declaration, not the name.
 *
 * WHY THIS EXISTS. Read-vs-write gates the chat's opening line and the phase
 * sinks (and, until 2026-08-26, the agent dry run). All of them
 * used to gate on a REGEX over the tool's name, which cannot express "called
 * `check_` and writes anyway". `check_github_app` is exactly that — its handler
 * fires a Helix code sync on a 404 — and the guard holding it closed had to be
 * found by a hand audit of all 43 read-shaped tools, because nothing could state
 * it.
 *
 * Two halves, and both are needed:
 *
 *  - COVERAGE: every registered tool declares. A tool that forgets fails closed
 *    (treated as a write), so the miss is safe but silent; this is what makes it
 *    loud.
 *  - BEHAVIOUR: the gate honours the declaration over the name, tested by
 *    EXECUTION on a probe whose name and declaration deliberately disagree.
 *    That case is the whole reason for the change, so testing it any other way
 *    would test the wrong thing.
 */

import * as fs from 'fs';
import { readdirSync, readFileSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer, isReadOnlyToolName } from '@/features/ai/server/inExtensionMcpServer';
import { callToolOverSocket, connectAndInit, makeLogger } from './inExtensionMcpServer.testUtils';

/** Tools whose declaration deliberately disagrees with their name shape. */
const RECORDED_DISAGREEMENTS: Record<string, string> = {
    // Read-shaped name, and read-only AS EXPOSED: the handler triggers a code
    // sync on a 404, but argDefaults forces skipTrigger so that is unreachable.
    // (Agrees, so not listed — kept here as the note for the next reader.)

    // Write-shaped names that only touch in-memory session state.
    select_org: 'setAdobeTarget is an in-memory module variable',
    select_project: 'setAdobeTarget is an in-memory module variable',
    select_workspace: 'setAdobeTarget is an in-memory module variable',
    set_setting: 'hands back to the user; changes no setting itself',
    validate_component_selection: 'dispatches compatibility checks and returns a verdict',
};

const ran = jest.fn();

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const ok = async () => ({ content: [{ type: 'text' as const, text: 'ran for real' }] });

    // THE case a name cannot express: read-shaped name, declares that it writes.
    srv.registerTool(
        'get_probe_that_writes',
        {
            description: 'read-shaped name, writes',
            inputSchema: {},
            annotations: { readOnlyHint: false },
        },
        async (a: unknown) => {
            ran(a);
            return ok();
        }
    );

    // The inverse: write-shaped name, declares read-only.
    srv.registerTool(
        'deploy_probe_that_reads',
        {
            description: 'write-shaped name, reads',
            inputSchema: { scope: z.string().optional() },
            annotations: { readOnlyHint: true },
        },
        async (a: unknown) => {
            ran(a);
            return ok();
        }
    );

    // Declares nothing at all — must fail CLOSED.
    srv.registerTool('get_probe_undeclared', { description: 'no annotations', inputSchema: {} }, ok);
}

/*
 * Two tests here drove the DRY RUN — that a read-NAMED tool declaring a write is
 * blocked, and that a tool declaring nothing fails CLOSED. Both left with the
 * dry run on 2026-08-26 (AI-3b); nothing consumes the fail-closed property any
 * more. If the dry run comes back, they come back with it — the declarations
 * they guarded are all still here.
 *
 * What remains gates the CHAT's opening line, which follows the same rule.
 */
describe('the chat reads the declaration, not the name', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(async () => {
        ran.mockClear();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-annot-'));
        socketPath = path.join(dir, 'srv.sock');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
        });
        await server.start();
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('runs a write-NAMED tool that declares it only reads', async () => {
        const text = await callToolOverSocket(socketPath, 'deploy_probe_that_reads', {
            scope: 'x',
        });

        expect(ran).toHaveBeenCalledTimes(1);
        expect(text).toBe('ran for real');
    });

    it('says nothing in the chat for a write-NAMED tool that only reads', async () => {
        // The opening line follows the same declaration, or the chat would
        // narrate a query.
        const { socket, rpc } = await connectAndInit(socketPath);
        const res = await rpc.request(2, 'tools/call', {
            name: 'deploy_probe_that_reads',
            arguments: {},
            _meta: { progressToken: 'tok-1' },
        });
        const progress = rpc.notifications.filter((n) => n.method === 'notifications/progress');
        socket.end();

        expect(res.result).toBeDefined();
        expect(progress).toEqual([]);
    });
});

describe('every tool declares', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-annot-list-'));
        socketPath = path.join(dir, 'srv.sock');
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {});
        await server.start();
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    /** `tools/list` as a real client sees it — the only view that proves it shipped. */
    async function listedTools(): Promise<{ name: string; annotations?: { readOnlyHint?: boolean } }[]> {
        const { socket, rpc } = await connectAndInit(socketPath);
        const res = await rpc.request(2, 'tools/list', {});
        socket.end();
        return res.result?.tools ?? [];
    }

    it('declares readOnlyHint on every tool a bare server registers', async () => {
        // ONLY the file-based project tools. The other 93 are registered from
        // `extension.ts` through `registerExtraTools`, which needs vscode and
        // cannot be booted here — so this half proves the annotation SURVIVES
        // registration and reaches a real client, and the source scan below is
        // what proves coverage. The vacuous-pass guard is deliberately set to
        // what this server actually serves, not to the full surface: the first
        // version of this test asserted >20 and would have read as full
        // coverage while seeing a tenth of it.
        const tools = await listedTools();
        const undeclared = tools
            .filter((t) => typeof t.annotations?.readOnlyHint !== 'boolean')
            .map((t) => t.name);

        expect(tools.length).toBeGreaterThanOrEqual(10);
        expect(undeclared).toEqual([]);
    });

    it('agrees with the name shape except where a disagreement is recorded', async () => {
        // The name regex survives ONLY as this cross-check. A disagreement is
        // either a bug or deliberate, and this is what makes the difference
        // explicit instead of silent.
        const tools = await listedTools();
        const surprises = tools
            .filter((t) => t.annotations?.readOnlyHint !== isReadOnlyToolName(t.name))
            .map((t) => t.name)
            .filter((n) => !(n in RECORDED_DISAGREEMENTS));

        expect(surprises).toEqual([]);
    });
});

describe('every registration site declares, at the source', () => {
    /*
     * The runtime check above can only see the tools a vscode-free server
     * registers. This is the half that covers all 103 — the same shape
     * `responseEnvelope.test.ts` uses, and for the same reason: most registrars
     * cannot be booted in a unit test.
     *
     * BOTH halves are scanned. The response-envelope guard shipped covering this
     * directory only, and ten tools in `src/mcp-server.ts` escaped it. Listing
     * that file rather than globbing is the correction, so it is listed here too.
     */
    const SERVER_DIR = 'src/features/ai/server';
    const EXTRA_REGISTRAR_FILES = ['src/mcp-server.ts'];

    const registrars = [
        ...readdirSync(SERVER_DIR).map((f) => `${SERVER_DIR}/${f}`),
        ...EXTRA_REGISTRAR_FILES,
    ]
        .filter((f) => f.endsWith('.ts'))
        .map((f) => ({ file: f, source: readFileSync(f, 'utf8') }))
        // ANCHORED to the start of a line: `src/mcp-server.ts` opens with a
        // docstring that names `server.registerTool(...)` in prose, and an
        // unanchored match counts that sentence as a registration.
        .filter(({ source }) => /^\s*server\.registerTool\(/m.test(source));

    it('scans a non-empty set of registrar modules', () => {
        // Vacuous-pass guard: a bad glob would make every assertion below pass.
        expect(registrars.length).toBeGreaterThan(10);
    });

    it('pairs every registerTool call with an annotations block', () => {
        const missing: string[] = [];

        for (const { file, source } of registrars) {
            // `inExtensionMcpServer.ts` re-wraps registerTool for logging and
            // registers nothing of its own; `toolDescriptors.ts` registers on
            // behalf of the 46 descriptor rows, whose declaration the COMPILER
            // already requires (`ToolDescriptor.readOnly`).
            if (/inExtensionMcpServer\.ts$|toolDescriptors\.ts$/.test(file)) continue;

            for (const m of source.matchAll(/^\s*server\.registerTool\(/gm)) {
                // The config object ends at the handler; annotations must appear
                // before it. A generous window, since configs vary in size.
                const window = source.slice(m.index, m.index + 2600);
                const name = /'([a-z_]+)'/.exec(window)?.[1] ?? '(unknown)';
                if (!/annotations:\s*\{[^}]*readOnlyHint:/.test(window)) {
                    missing.push(`${file}: ${name}`);
                }
            }
        }

        expect(missing).toEqual([]);
    });
});
