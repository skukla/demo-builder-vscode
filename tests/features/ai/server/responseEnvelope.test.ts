/**
 * Every tool answers in ONE envelope: `{content: [{type: 'text', text}]}`.
 *
 * The last unenforced convention from phase 3 — the phase that exists because
 * "keep JSON small" went unenforced for a year and phase 2 had to pay for it.
 * An agent parsing a response should never have to care which tool produced it,
 * and a tool that answers in some other shape breaks that silently: the SDK does
 * not validate output, so the failure surfaces as a model misreading a result.
 *
 * ## Why this is two tests and not one
 *
 * The surface has two halves with different risks, and a single check would
 * either miss one or invoke 103 tools against live services to cover both.
 *
 *   **Descriptor rows** — 46 of them, ALL wrapped by one line in
 *   `registerDescriptorTools`. One code path, so it is checked once, at runtime,
 *   by driving a row through the real registrar. If that line changes, every row
 *   changes with it and this fails.
 *
 *   **Bespoke tools** — 57 of them, each returning its own result. There is no
 *   shared wrapper to test, and invoking them would mean real Adobe, GitHub and
 *   Commerce calls. So they are checked at the SOURCE: a module that registers a
 *   tool must build its answer with a shared builder rather than hand-rolling
 *   the shape.
 *
 * The second is weaker than the first and says so. It proves a builder is
 * imported and used, not that every branch returns through it — but the failure
 * it actually guards is a NEW tool inventing its own shape, and that is exactly
 * what an absent import looks like.
 *
 * ## Where the source scan looks, and why it is a LIST
 *
 * 47 of the 57 bespoke tools live in `src/features/ai/server`. The other TEN are
 * `registerProjectTools` in `src/mcp-server.ts` — the vscode-free half, reached
 * through the same server (`inExtensionMcpServer.ts` registers it), so an agent
 * sees one tool list and cannot tell which file a tool came from.
 *
 * The first version of this suite scanned the directory only. It passed, and its
 * control passed with it, because the control shared the wrong scope — ten tools
 * hand-rolling the envelope sat outside the glob while this file claimed to cover
 * "both halves". Two reviewers found it independently. Hence the explicit list:
 * a directory is a guess about where the surface lives, and it was wrong.
 *
 * ## One envelope, two builders — established by writing this test
 *
 * The convention was stated here as "every tool answers JSON-as-text". That is
 * wrong, and the check caught it: FOUR bespoke tools plus the shared descriptor
 * registrar answer refusals and errors as bare PROSE, which `JSON.parse` rejects.
 * That is not drift to be corrected — a refusal an agent reads is the right shape,
 * and it predates every tool here.
 *
 * So `mcpToolResult` now exports both `asText` (serialize this value) and
 * `asRawText` (this string IS the text), and every site goes through one of them.
 * The envelope is the invariant; JSON is not.
 */

import { readdirSync, readFileSync } from 'fs';
import { asRawText, asText, type McpTextResult } from '@/features/ai/server/mcpToolResult';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import type { HandlerContext, HandlerMap } from '@/types/handlers';

const SERVER_DIR = 'src/features/ai/server';

/**
 * Registrar files OUTSIDE that directory. Listed, not globbed: this is the half
 * a directory scan missed, so naming each file is the point.
 */
const EXTRA_REGISTRAR_FILES = ['src/mcp-server.ts'];

/** The envelope, asserted structurally rather than by eye. */
function expectEnvelope(value: unknown): void {
    const result = value as McpTextResult;
    expect(Array.isArray(result?.content)).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
}

describe('the shared helper', () => {
    it('produces the envelope', () => {
        expectEnvelope(asText({ anything: true }));
    });

    it('serialises the value into the text field', () => {
        expect(JSON.parse(asText({ a: 1 }).content[0].text)).toEqual({ a: 1 });
    });

    it('asRawText produces the same envelope around text it does NOT serialise', () => {
        const result = asRawText('Error: no current project.');
        expectEnvelope(result);
        expect(result.content[0].text).toBe('Error: no current project.');
    });

    // The two builders differ in exactly one way, and it is the reason both exist:
    // routing a prose refusal through `asText` would quote and escape it.
    it('the two builders are not interchangeable', () => {
        expect(asText('hi').content[0].text).toBe('"hi"');
        expect(asRawText('hi').content[0].text).toBe('hi');
    });

    // Control: the assertion must be capable of failing.
    it('control: a bare object is NOT an envelope', () => {
        expect(() => expectEnvelope({ success: true })).toThrow();
    });
});

describe('every descriptor row answers in the envelope', () => {
    /** Captures what the registrar hands the SDK, without an SDK. */
    function capture(handlerResult: unknown) {
        const tools = new Map<string, (args: unknown) => Promise<unknown>>();
        const server = {
            registerTool(name: string, _def: unknown, handler: (args: unknown) => Promise<unknown>) {
                tools.set(name, handler);
            },
        };
        const map = { probe: async () => handlerResult } as unknown as HandlerMap;

        registerDescriptorTools(
            server,
            [{ tool: 'probe_tool', description: 'probe', map, type: 'probe' }],
            () => ({}) as HandlerContext,
        );
        return tools.get('probe_tool')!;
    }

    it('wraps a handler that returned data', async () => {
        const result = (await capture({ success: true, data: { a: 1 } })({})) as McpTextResult;
        expectEnvelope(result);

        // Pins the BUILDER, not just the shape. Swapping this line to `asText`
        // would double-encode every descriptor response — `"{\"a\":1}"` instead
        // of `{"a":1}` — and a structural check alone would not notice.
        expect(result.content[0].text).toBe(JSON.stringify({ a: 1 }));
    });

    it('wraps a handler that returned a failure', async () => {
        expectEnvelope(await capture({ success: false, error: 'nope' })({}));
    });

    it('wraps a bare success — the shape that renders as "{}"', async () => {
        expectEnvelope(await capture({ success: true })({}));
    });

    it('wraps a CONFIRM REFUSAL, which never reaches the handler', async () => {
        const tools = new Map<string, (args: unknown) => Promise<unknown>>();
        const server = {
            registerTool(name: string, _def: unknown, handler: (args: unknown) => Promise<unknown>) {
                tools.set(name, handler);
            },
        };
        const map = { probe: async () => ({ success: true }) } as unknown as HandlerMap;

        registerDescriptorTools(
            server,
            [{ tool: 'gated', description: 'g', map, type: 'probe', confirm: true }],
            () => ({}) as HandlerContext,
        );

        // The gate returns early, on its own path. An early return is exactly
        // where a hand-written response skips a shared wrapper.
        expectEnvelope(await tools.get('gated')!({}));
    });

    it('wraps a PREFLIGHT answer, which also never reaches the handler', async () => {
        const tools = new Map<string, (args: unknown) => Promise<unknown>>();
        const server = {
            registerTool(name: string, _def: unknown, handler: (args: unknown) => Promise<unknown>) {
                tools.set(name, handler);
            },
        };
        const map = { probe: async () => ({ success: true }) } as unknown as HandlerMap;

        registerDescriptorTools(
            server,
            [
                {
                    tool: 'preflighted',
                    description: 'p',
                    map,
                    type: 'probe',
                    preflight: () => ({ needsUser: { reason: 'browser-oauth' } }),
                },
            ],
            () => ({}) as HandlerContext,
        );

        expectEnvelope(await tools.get('preflighted')!({}));
    });
});

describe('every bespoke tool module builds its answer with the shared helper', () => {
    /** Modules that call `server.registerTool` directly, from BOTH halves. */
    const registrars = [
        ...readdirSync(SERVER_DIR).map((f) => `${SERVER_DIR}/${f}`),
        ...EXTRA_REGISTRAR_FILES,
    ]
        .filter((p) => p.endsWith('.ts'))
        .map((p) => ({ file: p, source: readFileSync(p, 'utf8') }))
        .filter(({ source }) => /server\.registerTool\(/.test(source));

    /**
     * One exemption, and it is not a tool: `inExtensionMcpServer.ts` re-wraps
     * `registerTool` for logging and registers nothing of its own, so it never
     * builds a response. `toolDescriptors.ts` is NOT exempt — it is the shared
     * wrapper, and it now goes through the helpers like everything else.
     */
    const EXEMPT = new Set([`${SERVER_DIR}/inExtensionMcpServer.ts`]);

    // Controls: the discovery must find BOTH halves. The first version of this
    // suite passed while missing ten tools, and a count-only control agreed with
    // it — so one control per half, each naming what it expects to see.
    it('control: finds the modules that register tools', () => {
        expect(registrars.length).toBeGreaterThan(10);
    });

    it('control: reaches outside the ai/server directory', () => {
        const outside = registrars.filter(({ file }) => !file.startsWith(SERVER_DIR));
        expect(outside.map((r) => r.file)).toEqual(EXTRA_REGISTRAR_FILES);
    });

    it('every registrar imports a builder, or is exempt with a stated reason', () => {
        const offenders = registrars
            .filter(({ file }) => !EXEMPT.has(file))
            .filter(({ source }) => !/mcpToolResult'/.test(source))
            .map(({ file }) => file);

        expect(offenders).toEqual([]);
    });

    it('the exemptions are real files that still register tools', () => {
        // A stale exemption is a hole that reads as a decision.
        const names = new Set(registrars.map((r) => r.file));
        expect([...EXEMPT].filter((f) => !names.has(f))).toEqual([]);
    });

    it('no registrar hand-rolls the envelope inline', () => {
        // The duplication that `mcpToolResult` was extracted to remove — it had
        // been pasted into eight files in two variants. A new copy is a new
        // place for the shape to drift. `mcpToolResult.ts` itself registers no
        // tool, so it is not in `registrars` and needs no exemption.
        const inlined = registrars
            .filter(({ file }) => !EXEMPT.has(file))
            .filter(({ source }) => /content:\s*\[\s*\{\s*type:\s*'text'/.test(source))
            .map(({ file }) => file);

        expect(inlined).toEqual([]);
    });
});
