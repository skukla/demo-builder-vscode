/**
 * The storefront report's window over the dashboard (EDS-64): what needs attention first,
 * then where the storefront comes from. Reading it changes nothing; its Reset is the
 * dashboard's own, and a broken link's page opens in DA.live.
 */

import { mockPostMessage, mockRequest, webviewClientHandlers } from '../../../../helpers/webviewClientMock';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import '@testing-library/jest-dom';
import { StorefrontReportModal } from '@/features/dashboard/ui/components/StorefrontReportModal';
import { useStorefrontReportDialog } from '@/features/dashboard/ui/hooks/useStorefrontReport';
import type { StorefrontReportView } from '@/types/webviewPayloads';

const VIEW: StorefrontReportView = {
    needsReset: 'This storefront is behind how Demo Builder builds storefronts now. Reset it to bring it up to date.',
    brokenLinks: [{ link: '/fr', pages: [{ path: '/store-switcher', editUrl: 'https://da.live/edit#/skukla/kukla-justrite/store-switcher' }] }],
    about: [
        { label: 'Comes from', text: "GitHub records it as made from adobe-commerce/boilerplate-b2b-template, one of Demo Builder's templates." },
        { label: 'Built on', text: "Built on Adobe's Commerce boilerplate 6.0.0." },
    ],
    details: ['Product-page fallback (smart 404): there.'],
};

function answer(view: StorefrontReportView | { error: string }): void {
    mockRequest.mockImplementation(async (type: string) =>
        type === 'getStorefrontReport'
            ? 'error' in view
                ? { success: false, error: view.error }
                : { success: true, data: view }
            : { success: true, data: { show: false } },
    );
}

function renderWindow() {
    const onClose = jest.fn();
    const onReset = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <StorefrontReportModal projectName="JustRite" onClose={onClose} onReset={onReset} />
        </Provider>,
    );
    return { onClose, onReset };
}

beforeEach(() => {
    jest.clearAllMocks();
    webviewClientHandlers.clear();
});

describe('StorefrontReportModal', () => {
    it('reads the report when it opens, titled with the name the SC gave the project', async () => {
        answer(VIEW);
        renderWindow();

        expect(screen.getByText('Reading the storefront')).toBeInTheDocument();
        expect(await screen.findByText('Needs your attention')).toBeInTheDocument();
        expect(screen.getByText('Storefront report: JustRite')).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('getStorefrontReport');
    });

    it('offers the dashboard Reset for a storefront that needs one, closing itself first', async () => {
        answer(VIEW);
        const { onClose, onReset } = renderWindow();

        fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("lists each broken link with its page, and opens that page in DA.live", async () => {
        answer(VIEW);
        renderWindow();

        expect(await screen.findByText("1 link goes to a page that doesn't exist")).toBeInTheDocument();
        fireEvent.click(screen.getByText('/store-switcher'));

        expect(mockPostMessage).toHaveBeenCalledWith('openDaLive', {
            url: 'https://da.live/edit#/skukla/kukla-justrite/store-switcher',
        });
    });

    it('says where the storefront comes from, with the detail folded away', async () => {
        answer(VIEW);
        renderWindow();

        expect(await screen.findByText('Comes from')).toBeInTheDocument();
        expect(screen.getByText("Built on Adobe's Commerce boilerplate 6.0.0.")).toBeInTheDocument();
        expect(screen.getByText('Details')).toBeInTheDocument();
    });

    it('says nothing needs attention when nothing does, and offers no Reset', async () => {
        answer({ ...VIEW, needsReset: undefined, brokenLinks: [] });
        renderWindow();

        expect(await screen.findByText('Nothing needs your attention.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    });

    it('says why it could not read the report, and reads it again on Try again', async () => {
        answer({ error: 'Could not read the storefront report: GitHub 502' });
        renderWindow();

        expect(await screen.findByText('Could not read the storefront report: GitHub 502')).toBeInTheDocument();
        answer(VIEW);
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

        expect(await screen.findByText('Needs your attention')).toBeInTheDocument();
        expect(mockRequest.mock.calls.filter(([type]) => type === 'getStorefrontReport')).toHaveLength(2);
    });
});

describe('useStorefrontReportDialog', () => {
    it('opens for a dashboard opened to show it, asking once on mount', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { show: true } });

        const { result } = renderHook(() => useStorefrontReportDialog());

        await waitFor(() => expect(result.current.isOpen).toBe(true));
        expect(mockRequest).toHaveBeenCalledWith('takeStorefrontReportRequest');
    });

    it('opens on the push a dashboard already open is sent, and closes', async () => {
        mockRequest.mockResolvedValue({ success: true, data: { show: false } });
        const { result } = renderHook(() => useStorefrontReportDialog());

        act(() => webviewClientHandlers.get('showStorefrontReport')?.(undefined));
        expect(result.current.isOpen).toBe(true);

        act(() => result.current.close());
        expect(result.current.isOpen).toBe(false);
    });

    it('stays closed when the reply carries no answer', async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'boom' });

        const { result } = renderHook(() => useStorefrontReportDialog());
        await act(async () => Promise.resolve());

        expect(result.current.isOpen).toBe(false);
    });
});
