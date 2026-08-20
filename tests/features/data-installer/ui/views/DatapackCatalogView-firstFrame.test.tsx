/**
 * The first frame, before the fetch has even started.
 *
 * Reported 2026-08-20 as "a small blip before they show their loading states":
 * for one frame the catalog rendered its LOADED view, then the spinner appeared.
 *
 * `useVSCodeRequest` starts `loading` FALSE, and the fetch is kicked off from a
 * useEffect — which React runs AFTER the first paint. So every mount passes
 * through a frame where nothing is loading and nothing has loaded. A guard that
 * asks `loading && !value` is false there and falls straight through to the
 * content.
 *
 * The guard asks `!settled` instead: has anything actually come back?
 *
 * This lives in its own file because it needs the HOOK mocked to hold that exact
 * state. The main suite deliberately mocks `webviewClient` instead, one layer
 * lower, so the real envelope unwrapping runs — and at that layer the frame is
 * unobservable, because RTL's `render()` flushes effects before it returns. That
 * is precisely why the main suite's "shows the loading display while the first
 * request is in flight" test passed throughout: by the time it asserts, the
 * effect has fired and `loading` is true. It pins the second frame, not the
 * first.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

/** Nothing loading, nothing loaded — exactly what the first paint sees. */
const NOT_YET_ASKED = { loading: false, error: null, data: null };

jest.mock('@/core/ui/hooks/useVSCodeRequest', () => ({
    // `execute` must return a promise: the wrapper does
    // `void execute(payload).catch(...)` so an unhandled rejection never reaches
    // the webview console. A bare jest.fn() returns undefined and throws there.
    useVSCodeRequest: () => ({
        execute: jest.fn().mockReturnValue(new Promise(() => undefined)),
        reset: jest.fn(),
        ...NOT_YET_ASKED,
    }),
}));

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn(), postMessage: jest.fn() },
}));

// Below the mocks on purpose — see webview-test-authoring §3.
import { DatapackCatalogView } from '@/features/data-installer/ui/views/DatapackCatalogView';

describe('DatapackCatalogView — the frame before the fetch', () => {
    it('shows the loading state, not the catalog', () => {
        render(<DatapackCatalogView />);

        expect(screen.getByText(/loading datapacks/i)).toBeInTheDocument();
    });

    it('shows no search bar, which belongs to a list that has not arrived', () => {
        render(<DatapackCatalogView />);

        expect(
            screen.queryByRole('searchbox', { name: /filter|search/i }),
        ).not.toBeInTheDocument();
    });
});
