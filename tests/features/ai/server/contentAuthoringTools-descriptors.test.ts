/**
 * Content-authoring tools — what each tool DECLARES about itself, and what it
 * does when called with nothing.
 *
 * The declaration is not decoration. `needsAuth` is what makes a tool hand off
 * to sign-in instead of failing as a 401; `readOnlyHint`/`destructiveHint` are
 * what the client reads to decide whether a call needs the user's say-so, and
 * `delete_page` is the one tool here that unpublishes and deletes. The suites in
 * this family exercised the HANDLERS through a server double that dropped the
 * definition on the floor, so every one of those declarations could have been
 * anything at all.
 *
 * The second half pins the other thing a server double hides: a tool invoked
 * with no arguments at all. Every handler here reads `args?.path` for that
 * reason — a handler that throws takes the MCP session down with it, and the
 * agent sees a dead server rather than a missing argument.
 */

import {
    fakeServer,
    ctxFactory,
    HelixServiceMock,
    registerContentAuthoringTools,
    setupContentAuthoring,
} from './contentAuthoringTools.testUtils';

beforeEach(() => {
    jest.clearAllMocks();
    setupContentAuthoring();
});

function server(): ReturnType<typeof fakeServer> {
    const s = fakeServer();
    registerContentAuthoringTools(s, ctxFactory, HelixServiceMock);
    return s;
}

// ─── declarations ────────────────────────────────────────────────────────────

describe('every content tool declares the DA.live session it needs', () => {
    it.each([
        'read_page',
        'write_page',
        'publish_page',
        'list_content',
        'delete_page',
        'read_published_page',
    ])('%s declares needsAuth dalive', (tool) => {
        expect(server().definition(tool).needsAuth).toEqual(['dalive']);
    });
});

describe('the read/write split each tool advertises', () => {
    // readOnlyHint governs whether a client may call a tool without asking, and
    // destructiveHint governs whether it warns first. delete_page is the only
    // irreversible one in the module.
    it.each([
        ['read_page', true, false],
        ['write_page', false, false],
        ['publish_page', false, false],
        ['list_content', true, false],
        ['delete_page', false, true],
        ['read_published_page', true, false],
    ])('%s is readOnly=%s destructive=%s', (tool, readOnlyHint, destructiveHint) => {
        expect(server().definition(tool).annotations).toEqual({ readOnlyHint, destructiveHint });
    });
});

describe('the arguments each tool accepts', () => {
    it.each([
        ['read_page', ['path']],
        ['write_page', ['path', 'content', 'publish']],
        ['publish_page', ['path']],
        ['list_content', ['path', 'limit', 'skip']],
        ['delete_page', ['path', 'confirm']],
        ['read_published_page', ['path']],
    ])('%s takes %s — and no org or site', (tool, fields) => {
        // No org/site argument is the containment control the whole module rests
        // on: an override would reach any DA.live site the user's token can.
        expect(Object.keys(server().definition(tool).inputSchema ?? {})).toEqual(fields);
    });

    it('every tool describes itself for the agent that has to choose one', () => {
        for (const tool of server().names()) {
            expect(server().definition(tool).description ?? '').not.toHaveLength(0);
        }
    });
});

// ─── invoked with nothing ────────────────────────────────────────────────────

describe('a tool invoked with no arguments answers rather than crashing', () => {
    it.each([
        ['read_page', /path is required/i],
        ['write_page', /path is required/i],
        ['publish_page', /path is required/i],
        ['delete_page', /path is required/i],
    ])('%s says the path is missing', async (tool, expected) => {
        const res = await server().callRaw<{ error: string }>(tool, undefined);
        expect(res.error).toMatch(expected);
    });

    // list_content's path is optional — with no arguments at all it lists the
    // site root, which is the documented default.
    it('list_content falls back to the site root', async () => {
        const { daOps } = setupContentAuthoring();

        const res = await server().callRaw<{ path: string; limit: number; skip: number }>(
            'list_content',
            undefined
        );

        expect(daOps.listDirectory).toHaveBeenCalledWith('skukla', 'bodea', '/');
        expect(res).toMatchObject({ path: '/', limit: 100, skip: 0 });
    });

    it('read_published_page says the path is missing', async () => {
        const res = await server().callRaw<{ error: string }>('read_published_page', undefined);
        expect(res.error).toMatch(/path is required/i);
    });
});

// ─── a path that is only whitespace ──────────────────────────────────────────

describe('a path of nothing but whitespace is a missing path', () => {
    // Untrimmed, "   " survives the required check and then normalises to "/",
    // so a tool asked for a blank path would silently act on the site ROOT —
    // for delete_page that is the home page.
    it.each(['read_page', 'write_page', 'publish_page', 'delete_page'])(
        '%s refuses it rather than acting on the site root',
        async (tool) => {
            const { daOps, helix } = setupContentAuthoring();

            const res = await server().call<{ error: string }>(tool, {
                path: '   ',
                content: '<p>x</p>',
                confirm: true,
            });

            expect(res.error).toMatch(/path is required/i);
            expect(daOps.readSource).not.toHaveBeenCalled();
            expect(daOps.createSource).not.toHaveBeenCalled();
            expect(daOps.deleteSource).not.toHaveBeenCalled();
            expect(helix.previewAndPublishPage).not.toHaveBeenCalled();
            expect(helix.unpublishPage).not.toHaveBeenCalled();
        }
    );
});
