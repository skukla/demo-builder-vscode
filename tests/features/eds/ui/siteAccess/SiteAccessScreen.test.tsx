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
import userEvent from '@testing-library/user-event';
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
            { email: 'owner@x.example', role: 'Configuration admin', removable: true },
            { email: 'lead@x.example', role: 'Org admin', removable: false },
        ],
    },
    readers: {
        site: 'acme/shop',
        canManage: true,
        people: [
            { email: 'reader@x.example', role: 'Reads content', removable: true },
            { email: 'OWNER@x.example', role: 'Reads content', removable: true },
        ],
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

function setupUser() {
    return userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('SiteAccessScreen', () => {
    it('with a storefront, shows one list: each person once, with everything they hold', async () => {
        answer({ getSiteAccess: () => ({ success: true, data: VIEW }) });

        renderScreen(true);

        expect(await screen.findByText('owner@x.example')).toBeInTheDocument();
        expect(screen.getByText('Configuration admin, Reads content')).toBeInTheDocument();
        expect(screen.getByText('reader@x.example')).toBeInTheDocument();
        expect(screen.queryByText('OWNER@x.example')).not.toBeInTheDocument();
        expect(screen.getByText('3 people have access')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('getSiteAccess', { target: undefined }, undefined);
    });

    it('offers a menu only on rows with something to remove', async () => {
        answer({ getSiteAccess: () => ({ success: true, data: VIEW }) });

        renderScreen(true);

        expect(await screen.findByRole('button', { name: 'More actions for owner@x.example' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'More actions for lead@x.example' })).not.toBeInTheDocument();
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
        const user = setupUser();

        await user.click(await screen.findByRole('button', { name: 'More actions for owner@x.example' }));
        await user.click(await screen.findByRole('menuitem', { name: 'Remove configuration admin' }));
        const dialog = await screen.findByRole('dialog');
        expect(mockRequest).not.toHaveBeenCalledWith('removeSiteAdmin', expect.anything(), undefined);
        await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

        expect(await screen.findByText(after.notice.message)).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith(
            'removeSiteAdmin',
            { email: 'owner@x.example', target: undefined },
            undefined,
        );
    });

    it('gives content access by default from the Give access dialog', async () => {
        const after: SiteAccessChangeResult = {
            notice: { tone: 'success', message: 'new@x.example can now read this content.' },
            view: VIEW,
        };
        answer({
            getSiteAccess: () => ({ success: true, data: VIEW }),
            addContentReader: () => ({ success: true, data: after }),
        });
        renderScreen(true);
        const user = setupUser();

        await user.click(await screen.findByRole('button', { name: 'Give access' }));
        const dialog = await screen.findByRole('dialog');
        const give = within(dialog).getByRole('button', { name: 'Give access' });
        expect(give).toHaveAttribute('aria-disabled', 'true');
        await user.type(within(dialog).getByLabelText('Email'), 'new@x.example');
        await user.click(give);

        expect(await screen.findByText(after.notice.message)).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith(
            'addContentReader',
            { email: 'new@x.example', target: undefined },
            undefined,
        );
        expect(mockRequest).not.toHaveBeenCalledWith('addSiteAdmin', expect.anything(), undefined);
    });

    it('gives both kinds when both are ticked, and a refusal becomes a notice', async () => {
        answer({
            getSiteAccess: () => ({ success: true, data: VIEW }),
            addSiteAdmin: () => ({ success: true, data: { notice: { tone: 'success', message: 'ok' }, view: VIEW } }),
            addContentReader: () => ({ success: false, error: 'That is not an email address.' }),
        });
        renderScreen(true);
        const user = setupUser();

        await user.click(await screen.findByRole('button', { name: 'Give access' }));
        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText('Email'), 'nope@x.example');
        await user.click(within(dialog).getByRole('checkbox', { name: /configuration admin/ }));
        await user.click(within(dialog).getByRole('button', { name: 'Give access' }));

        expect(await screen.findByText('That is not an email address.')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('addSiteAdmin', { email: 'nope@x.example', target: undefined }, undefined);
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
        expect(screen.queryByRole('button', { name: 'Give access' })).not.toBeInTheDocument();

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
