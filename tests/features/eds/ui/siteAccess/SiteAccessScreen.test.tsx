/**
 * SiteAccessScreen — the Site access webview.
 *
 * Driven through the mocked webview client: each request answers the way the
 * host handler would (Pattern B envelopes), so these read what the SC sees.
 */

import '../../../../helpers/webviewClientMock';
import { mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider, defaultTheme } from '@adobe/react-spectrum';

// Below the mock on purpose — see webview-test-authoring §3.
import { SiteAccessScreen } from '@/features/eds/ui/siteAccess/SiteAccessScreen';
import { asDisplayName } from '@/core/utils/projectDisplayName';
import { SITE_ACCESS_PROGRESS_MESSAGE } from '@/types/messages';
import type { SiteAccessChangeResult, SiteAccessView } from '@/types/webviewPayloads';

const VIEW: SiteAccessView = {
    admins: {
        site: 'acme/shop',
        canManage: true,
        people: [
            { email: 'owner@x.example', role: 'Site admin', removable: true },
            { email: 'lead@x.example', role: 'Org admin — every site', removable: false },
        ],
    },
    readers: {
        site: 'acme/shop',
        canManage: true,
        people: [{ email: 'reader@x.example', role: 'Reads', removable: true }],
    },
};

type Answer = (payload: unknown) => unknown;

function answer(handlers: Record<string, Answer>): void {
    mockRequest.mockImplementation(async (type: string, payload: unknown) => {
        const handler = handlers[type];
        return handler ? handler(payload) : { success: true };
    });
}

function renderScreen(hasStorefront: boolean) {
    return render(
        <Provider theme={defaultTheme}>
            <SiteAccessScreen theme="light" projectName={asDisplayName('Demo')} hasStorefront={hasStorefront} />
        </Provider>,
    );
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('SiteAccessScreen', () => {
    it('with a storefront, loads and shows both lists', async () => {
        answer({ getSiteAccess: () => ({ success: true, data: VIEW }) });

        renderScreen(true);

        expect(await screen.findByText('owner@x.example')).toBeInTheDocument();
        expect(screen.getByText('reader@x.example')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('getSiteAccess', { target: undefined }, undefined);
    });

    it('offers Remove only for rows that can be removed', async () => {
        answer({ getSiteAccess: () => ({ success: true, data: VIEW }) });

        renderScreen(true);

        expect(await screen.findByRole('button', { name: 'Remove owner@x.example' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove lead@x.example' })).not.toBeInTheDocument();
    });

    it('without a storefront, asks for the org and site before reading anything', async () => {
        answer({
            getSiteAccess: () => ({ success: true, data: { readers: VIEW.readers } }),
        });

        renderScreen(false);

        expect(mockRequest).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('DA.live organization'), { target: { value: 'acme' } });
        fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'shop' } });
        fireEvent.click(screen.getByRole('button', { name: 'Show Access' }));

        expect(await screen.findByText('reader@x.example')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith(
            'getSiteAccess',
            { target: { org: 'acme', site: 'shop' } },
            undefined,
        );
    });

    it('confirms a removal before sending it, and shows what happened', async () => {
        const after: SiteAccessChangeResult = {
            notice: { tone: 'success', message: 'owner@x.example is no longer a configuration admin.' },
            view: { ...VIEW, admins: { ...VIEW.admins!, people: [] } },
        };
        answer({
            getSiteAccess: () => ({ success: true, data: VIEW }),
            removeSiteAdmin: () => ({ success: true, data: after }),
        });
        renderScreen(true);

        fireEvent.click(await screen.findByRole('button', { name: 'Remove owner@x.example' }));
        const dialog = await screen.findByRole('dialog');
        expect(mockRequest).not.toHaveBeenCalledWith('removeSiteAdmin', expect.anything(), undefined);
        fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));

        expect(await screen.findByText(after.notice.message)).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith(
            'removeSiteAdmin',
            { email: 'owner@x.example', target: undefined },
            undefined,
        );
    });

    it('a refusal envelope becomes a notice, not a crash', async () => {
        answer({
            getSiteAccess: () => ({ success: true, data: VIEW }),
            addContentReader: () => ({ success: false, error: 'That is not an email address.' }),
        });
        renderScreen(true);

        const field = await screen.findByLabelText('Add a content reader');
        fireEvent.change(field, { target: { value: 'nope' } });
        const section = field.closest('section') ?? document.body;
        fireEvent.click(within(section as HTMLElement).getAllByRole('button', { name: 'Add' }).pop()!);

        expect(await screen.findByText('That is not an email address.')).toBeInTheDocument();
    });

    it('a list that cannot be changed shows why, with the fix and the wait', async () => {
        const refused: SiteAccessView = {
            admins: {
                site: 'acme/shop',
                canManage: false,
                people: [],
                notice: {
                    tone: 'warning',
                    message: 'You hold no admin role on acme/shop.',
                    links: [{ id: 'code-sync-app', label: 'Open Code Sync App' }],
                    offerWait: true,
                },
            },
        };
        let finishWait: (value: unknown) => void = () => undefined;
        answer({
            getSiteAccess: () => ({ success: true, data: refused }),
            openSiteAccessLink: () => ({ success: true }),
            waitForSiteAccess: () => new Promise((resolve) => (finishWait = resolve)),
        });
        renderScreen(true);

        fireEvent.click(await screen.findByRole('button', { name: 'Open Code Sync App' }));
        expect(mockRequest).toHaveBeenCalledWith('openSiteAccessLink', { id: 'code-sync-app' }, undefined);
        expect(screen.queryByLabelText('Add a configuration admin')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /check access/ }));
        expect(await screen.findByText('Waiting for site access')).toBeInTheDocument();
        act(() => webviewClientHandlers.get(SITE_ACCESS_PROGRESS_MESSAGE)?.({ message: 'Checking access 2 of 4' }));
        expect(await screen.findByText('Checking access 2 of 4')).toBeInTheDocument();

        await act(async () =>
            finishWait({
                success: true,
                data: {
                    notice: { tone: 'success', message: 'Access confirmed.', offerRepair: true },
                    view: refused,
                },
            }),
        );
        await waitFor(() => expect(screen.getByRole('button', { name: 'Repair Site Configuration' })).toBeInTheDocument());
    });
});
