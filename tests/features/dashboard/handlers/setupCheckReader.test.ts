/**
 * setupCheckReader — the signed Commerce GET the setup checks (and "Prepare this store")
 * read with (AB-77 fix). It must be UNCUT: the agent tool's `sendRest` cuts an answer at
 * 30,000 characters and declares it, which is right for a chat answer and fatal for a
 * check that parses the body (Justrite 2026-10-10: `GET products/attribute-sets/<id>/attributes`
 * answers more than that, and the attribute-set check died on "Unterminated string in JSON
 * at position 30000"). With a control that the agent tool's read still cuts.
 */

import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { makeStateManager } from '../../../helpers/stateManagerFake';
import type { HandlerContext } from '@/types/handlers';

const mockResolveRestTarget = jest.fn();
jest.mock('@/features/ai/server/commerceRestClient', () => ({
    ...jest.requireActual('@/features/ai/server/commerceRestClient'),
    resolveRestTarget: (...a: unknown[]) => mockResolveRestTarget(...a),
}));

// Below the mock on purpose: jest.mock hoists above this file's imports.
import { sendRest, type RestTarget } from '@/features/ai/server/commerceRestClient';
import { setupCheckReader } from '@/features/dashboard/handlers/setupChecklistHandlers';

const TARGET: RestTarget = { base: 'https://tenant.example', token: 't', clientId: 'c', imsOrgCode: 'o' };

/** A page far past the agent tool's cut: 400 attribute rows, about 40,000 characters. */
const BIG_PAGE = JSON.stringify(
    Array.from({ length: 400 }, (_unused, i) => ({ attribute_id: i, attribute_code: `attribute_${String(i).padStart(3, '0')}`, frontend_input: 'text', default_frontend_label: `Attribute number ${i} with a long label` })),
);

function fetchAnswering(body: string, status = 200): typeof fetch {
    return jest.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;
}

function context(): HandlerContext {
    return createMockHandlerContext({ stateManager: makeStateManager(createMockProject()) });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockResolveRestTarget.mockResolvedValue(TARGET);
});

describe('setupCheckReader', () => {
    it('CONTROL: the page is past the cut, and the agent tool\'s read cuts it', async () => {
        expect(BIG_PAGE.length).toBeGreaterThan(30_000);
        const cut = await sendRest('GET', TARGET, 'products/attribute-sets/4/attributes', undefined, fetchAnswering(BIG_PAGE));
        expect(cut).toContain('[truncated:');
        expect(() => JSON.parse(cut.slice(cut.indexOf('\n') + 1))).toThrow();
    });

    it('hands the checks the WHOLE body, so a big attribute-set page still parses', async () => {
        const { read } = await setupCheckReader(context(), createMockProject(), fetchAnswering(BIG_PAGE));
        const text = await read('products/attribute-sets/4/attributes');
        expect(text).toHaveLength(BIG_PAGE.length);
        expect((JSON.parse(text) as unknown[])).toHaveLength(400);
    });

    it('does not bound a search the check did not bound itself', async () => {
        const fetchImpl = fetchAnswering('{"items":[]}');
        const { read } = await setupCheckReader(context(), createMockProject(), fetchImpl);
        await read('products?searchCriteria[currentPage]=1');
        const url = String((fetchImpl as jest.Mock).mock.calls[0][0]);
        expect(url).toBe('https://tenant.example/V1/products?searchCriteria[currentPage]=1');
    });

    it('answers a 404 in the line the attribute check matches, and a refusal as its own line', async () => {
        const { read } = await setupCheckReader(context(), createMockProject(), fetchAnswering('{"message":"no such attribute"}', 404));
        expect(await read('products/attributes/brand')).toMatch(/^Error: Commerce REST answered HTTP 404\./u);
        mockResolveRestTarget.mockResolvedValue({ refusal: 'Error: Adobe sign-in required.' });
        const refused = await setupCheckReader(context(), createMockProject(), fetchAnswering(''));
        expect(await refused.read('company/')).toBe('Error: Adobe sign-in required.');
    });
});
