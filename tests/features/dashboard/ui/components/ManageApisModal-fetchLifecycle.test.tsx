/**
 * ManageApisModal — the fetch lifecycle, split from the behaviour suite.
 *
 * Everything here is about a response arriving at the WRONG time or in the wrong
 * shape: a stale list landing after the modal has moved to another integration,
 * a response that is not the shape the handler promises, and the apply write's
 * own failure paths. The behaviour suite covers the surface when everything
 * answers as it should.
 *
 * The cancellation tests are the reason this file exists. `cancelled` is set by
 * the effect's cleanup, so proving it works needs two requests in flight at once
 * and control over which settles first — which is a different kind of test from
 * "click the box, press Apply".
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { ManageApisModal } from '@/features/dashboard/ui/components/ManageApisModal';
import '@testing-library/jest-dom';

function getClient() {
    const { webviewClient } = jest.requireMock('@/core/ui/utils/WebviewClient');
    return webviewClient;
}

const ORG_APIS = [
    { code: 'GraphQLServiceSDK', name: 'API Mesh', managed: true },
    { code: 'AssetsSDK', name: 'AEM Assets', managed: false },
    { code: 'FireflySDK', name: 'Firefly Services', managed: false },
];

/** The list a SECOND integration answers with — distinguishable by name. */
const OTHER_APIS = [{ code: 'OtherSDK', name: 'Second Integration API', managed: false }];

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function modal(componentId: string | undefined, onClose: () => void) {
    return (
        <Provider theme={defaultTheme}>
            <ManageApisModal
                isOpen
                componentName="erp-sync"
                componentId={componentId}
                onClose={onClose}
            />
        </Provider>
    );
}

function renderModal(componentId?: string) {
    const onClose = jest.fn();
    return { onClose, ...render(modal(componentId, onClose)) };
}

function checkboxFor(name: string): HTMLInputElement {
    const label = screen.getByText(name).closest('label');
    if (!label) throw new Error(`No checkbox label found for "${name}"`);
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement;
}

function applyButton(): HTMLElement {
    return screen.getByRole('button', { name: /^apply/i });
}

beforeEach(() => {
    jest.clearAllMocks();
});

/**
 * Two list fetches in flight, one per integration, each settled by hand.
 *
 * @returns the deferreds for the first and second `listConsoleApis` calls
 */
function twoListsInFlight(): { first: Deferred<unknown>; second: Deferred<unknown> } {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    let seen = 0;
    getClient().request.mockImplementation((type: string) => {
        if (type !== 'listConsoleApis') return Promise.resolve({ success: true });
        seen += 1;
        return seen === 1 ? first.promise : second.promise;
    });
    return { first, second };
}

describe('a response that arrives after the modal has moved on', () => {
    it('ignores the list for the integration no longer being edited', async () => {
        // The grid keeps ONE modal instance for every row, so switching rows
        // re-fires the fetch without a remount. A slow first response landing
        // afterwards would repaint the new row with the old row's entitlements.
        const { first, second } = twoListsInFlight();
        const { rerender, onClose } = renderModal('erp-sync');
        await flush();
        rerender(modal('other-app', onClose));
        await flush();

        await act(async () => {
            second.resolve({ success: true, data: { apis: OTHER_APIS } });
            await Promise.resolve();
        });
        await act(async () => {
            first.resolve({ success: true, data: { apis: ORG_APIS } });
            await Promise.resolve();
        });

        expect(screen.getByText('Second Integration API')).toBeInTheDocument();
        expect(screen.queryByText('AEM Assets')).toBeNull();
    });

    it('ignores a stale REJECTION rather than reporting it against the new row', async () => {
        const { first, second } = twoListsInFlight();
        const { rerender, onClose } = renderModal('erp-sync');
        await flush();
        rerender(modal('other-app', onClose));
        await flush();

        await act(async () => {
            second.resolve({ success: true, data: { apis: OTHER_APIS } });
            await Promise.resolve();
        });
        await act(async () => {
            first.reject(new Error('stale failure'));
            await Promise.resolve();
        });

        expect(screen.queryByText(/stale failure/)).toBeNull();
        expect(screen.getByText('Second Integration API')).toBeInTheDocument();
    });

    it('stays loading when the stale request finishes and the live one has not', async () => {
        // The `finally` is guarded for its own reason: clearing the flag on the
        // stale request drops the loading view while the real one is still out,
        // and an empty picker reads as "this org has no APIs".
        const { first } = twoListsInFlight();
        const { rerender, onClose } = renderModal('erp-sync');
        await flush();
        rerender(modal('other-app', onClose));
        await flush();

        await act(async () => {
            first.resolve({ success: true, data: { apis: ORG_APIS } });
            await Promise.resolve();
        });

        expect(screen.getByText('Loading Adobe APIs…')).toBeInTheDocument();
    });
});

describe('a response that is not the shape the handler promises', () => {
    it('reports the default failure when nothing comes back at all', async () => {
        getClient().request.mockResolvedValue(undefined);
        renderModal();
        await flush();

        expect(screen.getByText('Could not load Adobe APIs.')).toBeInTheDocument();
    });

    it('does not render a list carried by an UNSUCCESSFUL response', async () => {
        // `success` and `data` must BOTH hold. A failure that happens to carry a
        // stale `data` block would otherwise paint a list the org never confirmed.
        getClient().request.mockResolvedValue({
            success: false,
            error: 'org unavailable',
            data: { apis: ORG_APIS },
        });
        renderModal();
        await flush();

        expect(screen.getByText(/org unavailable/i)).toBeInTheDocument();
        expect(screen.queryByText('AEM Assets')).toBeNull();
    });

    it('leaves Apply inert when the list never arrived', async () => {
        getClient().request.mockResolvedValue({ success: false, error: 'org unavailable' });
        renderModal();
        await flush();

        expect(applyButton()).toHaveAttribute('aria-disabled', 'true');
    });

    it('retries again after a retry that also failed', async () => {
        // Retry works by bumping a key the effect depends on. A bump that lands
        // on the same value the second time silently stops retrying, and the
        // button goes on looking like it works.
        getClient().request.mockResolvedValue({ success: false, error: 'boom' });
        renderModal();
        await flush();

        const before = getClient().request.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
        await flush();
        const afterFirst = getClient().request.mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
        await flush();

        expect(afterFirst).toBeGreaterThan(before);
        expect(getClient().request.mock.calls.length).toBeGreaterThan(afterFirst);
    });
});

describe('what counts as a change worth applying', () => {
    it('enables Apply for a swap that leaves the count the same', async () => {
        // Dropping one API and adding another is the commonest real edit, and
        // comparing lengths alone calls it unchanged.
        getClient().request.mockImplementation((type: string) =>
            type === 'listConsoleApis'
                ? Promise.resolve({ success: true, data: { apis: ORG_APIS, added: ['AssetsSDK'] } })
                : Promise.resolve({ success: true }),
        );
        renderModal();
        await flush();

        fireEvent.click(checkboxFor('AEM Assets'));
        fireEvent.click(checkboxFor('Firefly Services'));

        expect(applyButton()).toHaveAttribute('aria-disabled', 'false');
    });
});

describe('when the apply write goes wrong', () => {
    /** Load the list, then tick one box so Apply is live. */
    async function readyToApply(setConsoleApis: () => Promise<unknown>) {
        getClient().request.mockImplementation((type: string) =>
            type === 'listConsoleApis'
                ? Promise.resolve({ success: true, data: { apis: ORG_APIS } })
                : setConsoleApis(),
        );
        const rendered = renderModal();
        await flush();
        fireEvent.click(checkboxFor('Firefly Services'));
        return rendered;
    }

    it('reports the default failure when nothing comes back at all', async () => {
        const { onClose } = await readyToApply(() => Promise.resolve(undefined));

        fireEvent.click(applyButton());
        await flush();

        expect(screen.getByText('Could not update API access.')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('reports a rejected write rather than closing on it', async () => {
        const { onClose } = await readyToApply(() => Promise.reject(new Error('the write blew up')));

        fireEvent.click(applyButton());
        await flush();

        expect(screen.getByText(/the write blew up/)).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('lets the user try again instead of leaving Apply stuck', async () => {
        // The modal stays open on failure, so the button has to come back. Left
        // busy, the only way out is Cancel — which loses the edit.
        await readyToApply(() => Promise.resolve({ success: false, error: 'needs a profile' }));

        fireEvent.click(applyButton());
        await flush();

        expect(screen.getByRole('button', { name: /^apply$/i })).toHaveAttribute(
            'aria-disabled',
            'false',
        );
    });

    it('shows no error line at all until something fails', async () => {
        const { container } = await readyToApply(() => Promise.resolve({ success: true }));

        expect(container.querySelector('.text-red-600')).toBeNull();
    });
});
