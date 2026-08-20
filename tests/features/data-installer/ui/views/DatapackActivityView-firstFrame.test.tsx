/**
 * The first frame of the activity view claimed there was no activity.
 *
 * `useVSCodeRequest` starts `loading` FALSE and the fetch is kicked off from a
 * useEffect, which React runs AFTER the first paint. The body branched on
 * `loading && entries.length === 0`, which is false on frame 1 — so it fell
 * through to the EmptyState and rendered "No activity yet" before anything had
 * been asked.
 *
 * Worse than the sibling blip in DatapackCatalogView, which merely drew an empty
 * grid: this one made a claim, and the claim was not checked.
 *
 * `loading` is still read for the append case — entries already on screen with
 * more on the way — so the fix is `!settled || (loading && ...)`, not a swap.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

/** Nothing loading, nothing loaded — exactly what the first paint sees. */
const NOT_YET_ASKED = { loading: false, error: null, data: null };

/** The import target, already answered, naming an instance. */
const TARGET_SETTLED = {
    loading: false,
    error: null,
    data: { success: true, data: { instance: 'na1-sandbox' } },
};

/**
 * Hoisted, and that is load-bearing.
 *
 * The hook's return feeds `useCallback` deps all the way down. Building these
 * inline in the factory hands out a NEW identity every render, so the effects
 * that call `load` re-fire forever and the suite HANGS rather than failing.
 * Module scope keeps the identity stable, the way the real hook's `useCallback`
 * does.
 */
const stableExecute = jest.fn().mockReturnValue(new Promise(() => undefined));
const stableReset = jest.fn();

/**
 * Per TYPE, because the state under test is a narrow one.
 *
 * The view returns early on `!targetSettled` (line ~170), so a blanket
 * not-yet-asked mock never reaches the body at all — a first draft of this test
 * passed against BOTH the old and new guard for exactly that reason, and only
 * the control caught it. The blip needs the target ANSWERED and the activity
 * request not yet started: the frame after the target lands, before the query
 * effect fires.
 */
jest.mock('@/core/ui/hooks/useVSCodeRequest', () => ({
    useVSCodeRequest: (type: string) => ({
        execute: stableExecute,
        reset: stableReset,
        ...(type === 'get-datapack-import-target' ? TARGET_SETTLED : NOT_YET_ASKED),
    }),
}));

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: jest.fn(), postMessage: jest.fn() },
}));

// Below the mocks on purpose — see webview-test-authoring §3.
import { DatapackActivityView } from '@/features/data-installer/ui/views/DatapackActivityView';

describe('DatapackActivityView — the frame before the fetch', () => {
    it('does not claim there is no activity before it has asked', () => {
        render(<DatapackActivityView />);

        expect(screen.queryByText(/no activity yet/i)).not.toBeInTheDocument();
    });

    it('shows the loading state instead', () => {
        render(<DatapackActivityView />);

        expect(screen.getByText(/loading activity/i)).toBeInTheDocument();
    });
});
