/**
 * Content-authoring tools — RESPONSE SIZE.
 *
 * Split from contentAuthoringTools.test.ts to keep both files under the 500-line
 * limit. The mock preamble is duplicated because jest.mock is hoisted per file
 * and cannot be shared; the fixtures and harness are identical on purpose.
 */

import type { HelixService } from '@/features/eds/services/helix/helixService';
import {
    DaLiveContentOperationsMock,
    HelixServiceMock,
    getCurrentProject,
    getDaLiveAuthServiceMock,
    getGitHubServicesMock,
    isEdsProjectMock,
    registerContentAuthoringTools,
} from './contentAuthoringTools.testUtils';
import { COMPONENT_IDS } from '@/core/constants';
import type { HandlerContext } from '@/types/handlers';
import { expectWithinCeiling } from './responseCeilings';

/** Minimal MCP server double: capture handlers, invoke by name, parse the JSON back. */
function fakeServer() {
    const tools = new Map<string, (args: unknown) => Promise<{ content: Array<{ text: string }> }>>();
    return {
        registerTool(
            name: string,
            _def: unknown,
            handler: (args: unknown) => Promise<{ content: Array<{ text: string }> }>,
        ) {
            tools.set(name, handler);
        },
        names: () => [...tools.keys()],
         
        async call(name: string, args: unknown = {}): Promise<any> {
            return JSON.parse((await tools.get(name)!(args)).content[0].text);
        },
    };
}

// `selectedStack` must start with "eds-": the module now uses the shared
// getEdsRepoParts/getEdsDaLiveTarget getters, whose INTERNAL isEdsProject call
// resolves to the real implementation even though the SUT's own call is mocked.
// Mocking the getters instead would stop testing the coordinate extraction.
const EDS_PROJECT = {
    name: 'bodea',
    path: '/p/bodea',
    selectedStack: 'eds-commerce',
    componentInstances: {
        [COMPONENT_IDS.EDS_STOREFRONT]: {
            metadata: { githubRepo: 'skukla/bodea', daLiveOrg: 'skukla', daLiveSite: 'bodea' },
        },
    },
};

const ctxFactory = () =>
    ({
        stateManager: { getCurrentProject },
        context: { secrets: {} },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() },
    }) as unknown as HandlerContext;

// ─── service doubles ─────────────────────────────────────────────────────────

let daOps: {
    listDirectory: jest.Mock;
    createSource: jest.Mock;
    deleteSource: jest.Mock;
    readSource: jest.Mock;
};
let helix: {
    previewAndPublishPage: jest.Mock;
    unpublishPage: jest.Mock;
};
let fetchMock: jest.Mock;

const okResponse = (body: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => body,
});

function register() {
    const s = fakeServer();
    registerContentAuthoringTools(s, ctxFactory, HelixServiceMock);
    return s;
}

beforeEach(() => {
    jest.clearAllMocks();

    getCurrentProject.mockResolvedValue(EDS_PROJECT);
    isEdsProjectMock.mockReturnValue(true);
    getGitHubServicesMock.mockReturnValue({
        tokenService: { validateToken: jest.fn(async () => ({ valid: true })) },
    });
    getDaLiveAuthServiceMock.mockReturnValue({
        isAuthenticated: jest.fn(async () => true),
        getAccessToken: jest.fn(async () => 'da-token'),
    });

    daOps = {
        listDirectory: jest.fn(async () => []),
        createSource: jest.fn(async () => ({ success: true, path: '/about.html' })),
        deleteSource: jest.fn(async () => ({ success: true })),
        readSource: jest.fn(async () => ({
            status: 200,
            body: '<body><main>hi</main></body>',
            bytes: 28,
            truncated: false,
        })),
    };
    DaLiveContentOperationsMock.mockImplementation(() => daOps);

    helix = {
        previewAndPublishPage: jest.fn(async () => undefined),
        unpublishPage: jest.fn(async () => true),
    };
    // The fake is partial by design — these two methods are all these tools call.
    // Cast at the boundary, once, per ADR-016: the builder still answers the real type.
    HelixServiceMock.mockImplementation(() => helix as unknown as HelixService);

    fetchMock = jest.fn(async () => okResponse('<body><main>hi</main></body>'));
    global.fetch = fetchMock as unknown as typeof fetch;
});

// ─── response-size ceilings (phase 2 audit) ──────────────────────────────────
//
// Driven with OVERSIZED payloads — a 900-entry directory, a body past the read
// cap — because both bloat shapes this audit found (a list with no page size, a
// field carried for the dashboard) are invisible at fixture scale.
describe('response-size ceilings', () => {
    it('list_content — a 900-entry site root is paged, not dumped', async () => {
        daOps.listDirectory.mockResolvedValueOnce(
            Array.from({ length: 900 }, (_, i) => ({
                name: `page-number-${i}`,
                path: `/skukla/bodea/section/page-number-${i}.html`,
                ext: 'html',
            })),
        );

        const res = await register().call('list_content', {});

        expectWithinCeiling('list_content', JSON.stringify(res));
        expect(res.total).toBe(900);
        expect(res.entries.length).toBeLessThan(900);
    });

    it('read_page — the service cap survives the tool', async () => {
        daOps.readSource.mockResolvedValueOnce({
            status: 200, body: 'x'.repeat(30_000), bytes: 5_000_000, truncated: true,
        });

        const res = await register().call('read_page', { path: '/big' });

        expectWithinCeiling('read_page', JSON.stringify(res));
        expect(res.truncated).toBe(true);
    });

    it('read_published_page — an oversized CDN body is capped', async () => {
        fetchMock.mockResolvedValueOnce(okResponse('y'.repeat(500_000), 200));

        const res = await register().call('read_published_page', { path: '/big' });

        expectWithinCeiling('read_published_page', JSON.stringify(res));
        expect(res.truncated).toBe(true);
    });

    it.each([
        ['write_page', { path: '/a', content: '<p>x</p>' }],
        ['publish_page', { path: '/a' }],
        ['delete_page', { path: '/a', confirm: true }],
    ])('%s — outcome responses stay tiny', async (tool, args) => {
        expectWithinCeiling(tool, JSON.stringify(await register().call(tool, args)));
    });
});
