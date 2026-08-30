/**
 * Shared setup for the DatapackCatalogView suites.
 *
 * THIS FILE OWNS THE MOCK AND THE SUT IMPORT. Specs import the view and these
 * helpers from HERE, never from '@/features/...': jest.mock hoists above the
 * imports of the module it appears in, NOT across modules, so a spec importing the
 * view directly could load it before the WebviewClient mock registered.
 *
 * Split out 2026-08-30 because DatapackCatalogView.test.tsx reached 778 lines and
 * CI blocks test files over 750. Splitting it would otherwise have duplicated this
 * 166-line preamble into the new half, so it moved here instead of being copied.
 */

import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn() },
}));

// Below the mock on purpose (see useDataInstallerRequest's suite).
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackSummary } from '@/features/data-installer/types';

const mockRequest = webviewClient.request as jest.Mock;

/**
 * The type and payload of the most recent request.
 *
 * `webviewClient.request(type, payload, timeoutMs)` takes a third argument the
 * view leaves undefined, so asserting on the raw call array pins an argument
 * nothing here is about.
 */
/**
 * The most recent request OF A GIVEN TYPE.
 *
 * `lastRequest()` was sufficient while the view fired one request; it now also
 * asks `get-datapack-import-target` for the project's recorded sample-data
 * choice, so "the last call" is no longer "the catalog call". Assertions about
 * the catalog request must name it.
 */
function requestOfType(type: string): { type: unknown; payload: unknown } | undefined {
    const call = [...mockRequest.mock.calls].reverse().find((c) => c[0] === type);
    return call ? { type: call[0], payload: call[1] } : undefined;
}

function lastRequest(): { type: unknown; payload: unknown } {
    const call = mockRequest.mock.calls[mockRequest.mock.calls.length - 1] ?? [];
    return { type: call[0], payload: call[1] };
}

function makeSummary(
    name: string,
    version: string,
    overrides: Partial<DatapackSummary> = {}
): DatapackSummary {
    return {
        id: { name, version },
        displayName: name,
        shared: true,
        dataTypes: ['products'],
        art: {},
        ...overrides,
    };
}

/** Three names across five rows — the shape the live catalog actually has. */
const CATALOG = [
    makeSummary('bodea', 'main'),
    makeSummary('bodea', 'tierpricingfix'),
    makeSummary('wknd', 'main'),
    makeSummary('wknd', 'archive_06112026'),
    makeSummary('citisignal_new', 'main', { displayName: 'CitiSignal' }),
];

function resolveWith(items: DatapackSummary[]) {
    mockRequest.mockResolvedValue({
        success: true,
        data: { items, count: items.length, total: items.length },
    });
}

/**
 * Catalog + detail, the one definition.
 *
 * This existed TWICE under this exact name — once in the `detail flyout`
 * describe and once in `the import modal` — with different inventories and,
 * worse, different fallback semantics. One answered every unrecognised request
 * with the DETAIL payload; the other answered `data: null`. The catch-all was a
 * real fixture bug: the import modal reads `get-datapack-import-status`, so it
 * received a detail payload where it expected a job record and rendered its
 * result view instead of its form. That went unnoticed because the request was
 * still in flight when the tests asserted; settling made the modal deterministic
 * and the wrong answer visible.
 *
 * One name, two behaviours, is exactly the trap the fixture consolidation work
 * exists to close (ADR-016 § Fixtures and fakes, rule 4).
 *
 * @param inventory - what the service HOLDS for this datapack. The only thing
 *   the two copies legitimately varied, so it is the only parameter.
 */
function resolveCatalogThenDetail(inventory: {
    present: string[];
    missing: string[];
    presentCount: number;
    missingCount: number;
    requestedCount: number;
}) {
    mockRequest.mockImplementation((type: string) => {
        if (type === 'find-datapacks') {
            return Promise.resolve({
                success: true,
                data: { items: CATALOG, count: CATALOG.length, total: CATALOG.length },
            });
        }
        if (type === 'get-datapack-detail') {
            return Promise.resolve({
                success: true,
                data: {
                    detail: { ...CATALOG[0], description: 'B2B office supplies' },
                    inventory,
                },
            });
        }
        // Serves two consumers that share this request: the view's own
        // projectContext (DatapackCatalogView.tsx:102) and the import modal's
        // target (ImportDatapackModal.tsx:149) — same shape, same request.
        // Without an instance the modal renders "This project has no Commerce
        // instance" rather than the type list.
        if (type === 'get-datapack-import-target') {
            return Promise.resolve({
                success: true,
                data: { instance: 'inst', projectName: 'demo-1' },
            });
        }
        // Everything else is genuinely unasked. `null` is what "no record" looks
        // like — never a stand-in payload, which is what caused the bug above.
        return Promise.resolve({ success: true, data: null });
    });
}

/** What the flyout specs used: nothing missing. */
const INVENTORY_COMPLETE = {
    present: ['products'],
    missing: [],
    presentCount: 1,
    missingCount: 0,
    requestedCount: 1,
};

/** What the modal specs used: one type the service does not hold. */
const INVENTORY_WITH_GAP = {
    present: ['products'],
    missing: ['giftcards'],
    presentCount: 1,
    missingCount: 1,
    requestedCount: 2,
};

// Shared with the split suites.
export { DatapackCatalogView } from '@/features/data-installer/ui/views/DatapackCatalogView';
export {
    mockRequest,
    requestOfType,
    lastRequest,
    makeSummary,
    resolveWith,
    resolveCatalogThenDetail,
    CATALOG,
    INVENTORY_COMPLETE,
    INVENTORY_WITH_GAP,
};
