/**
 * The catalog menu dialog (EDS-24): Build and Remove on the dashboard, sending the two
 * messages the agent's tools dispatch into (`buildCatalogMenu`, `removeCatalogMenu`).
 * Nothing is sent until a button is pressed; Remove asks first, because it unpublishes
 * pages. The handlers answer Pattern B, so the dialog branches on `success` and shows
 * the handler's own summary or refusal.
 *
 * The host boundary is mocked; the body and the core Modal render real over the global
 * Spectrum stubs.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { settle } from '../../../../../helpers/reactSettle';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: (...args: unknown[]) => mockRequest(...args) },
}));

// The SUT binds below the mock on purpose (webview-test-authoring §3).
import { CatalogMenuModal } from '@/features/dashboard/ui/components/catalog-menu/CatalogMenuModal';
import type { BuildCatalogMenuResult, RemoveCatalogMenuResult } from '@/types/webviewRequests';

const BUILT: BuildCatalogMenuResult = {
    summary: 'Wrote and published 2 category pages. Added the catalog menu to your nav.',
    written: ['/safety-signs', '/safety-signs/exit-signs'],
    skipped: [],
    failed: [],
    unsafe: [],
    nav: 'added',
};
const REMOVED: RemoveCatalogMenuResult = {
    summary: 'Removed 2 category pages. Took the catalog menu out of your nav.',
    removed: ['/safety-signs', '/safety-signs/exit-signs'],
    alreadyGone: [],
    skipped: [],
    failed: [],
    nav: 'removed',
};

const button = (name: string): HTMLElement => screen.getByRole('button', { name });

async function click(name: string): Promise<void> {
    fireEvent.click(button(name));
    await settle();
}

function open(): { onClose: jest.Mock } {
    const onClose = jest.fn();
    render(<CatalogMenuModal isOpen onClose={onClose} />);
    return { onClose };
}

beforeEach(() => {
    mockRequest.mockReset();
});

describe('CatalogMenuModal', () => {
    it('opens on what the menu does and sends nothing until a button is pressed', () => {
        open();
        expect(screen.getByRole('heading', { name: 'Catalog Menu' })).toBeInTheDocument();
        expect(screen.getByText(/one page per category/)).toBeInTheDocument();
        expect(screen.getByText(/Demo Builder Blocks library/)).toBeInTheDocument();
        expect(button('Build the menu from the Commerce catalog')).toBeInTheDocument();
        expect(button('Remove the catalog menu')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('asks before building, because the pages go live, and sends nothing if the SC goes back', async () => {
        open();

        await click('Build the menu from the Commerce catalog');

        expect(screen.getByText(/writes and publishes one page per category to your live storefront/)).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
        await click('Back');
        expect(button('Remove the catalog menu')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('builds through the dashboard message once confirmed and shows the handler summary', async () => {
        mockRequest.mockResolvedValueOnce({ success: true, data: BUILT });
        open();

        await click('Build the menu from the Commerce catalog');
        await click('Build');

        expect(mockRequest).toHaveBeenCalledWith('buildCatalogMenu');
        expect(screen.getByText('Catalog menu built')).toBeInTheDocument();
        expect(screen.getByText(BUILT.summary)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Build the menu from the Commerce catalog' })).not.toBeInTheDocument();
    });

    it('shows the spinner alone while the build runs', async () => {
        mockRequest.mockReturnValueOnce(new Promise(() => undefined));
        open();

        await click('Build the menu from the Commerce catalog');
        await click('Build');

        expect(screen.getByText('Building the catalog menu')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Remove the catalog menu' })).not.toBeInTheDocument();
    });

    it("shows the handler's refusal in its own words — the missing library, say", async () => {
        const missing = "This storefront doesn't have the catalog menu block yet. Add the Demo Builder Blocks library.";
        mockRequest.mockResolvedValueOnce({ success: false, error: missing, code: 'COMPONENT_DEPENDENCY_MISSING' });
        open();

        await click('Build the menu from the Commerce catalog');
        await click('Build');

        expect(screen.getByText("Couldn't build the catalog menu")).toBeInTheDocument();
        expect(screen.getByText(missing)).toBeInTheDocument();
    });

    it('asks before removing, and sends nothing if the SC goes back', async () => {
        open();

        await click('Remove the catalog menu');

        expect(screen.getByText(/unpublishes and deletes the category pages Demo Builder wrote/)).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
        await click('Back');
        expect(button('Build the menu from the Commerce catalog')).toBeInTheDocument();
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('removes through the dashboard message once confirmed, and shows what came out', async () => {
        mockRequest.mockResolvedValueOnce({ success: true, data: REMOVED });
        open();

        await click('Remove the catalog menu');
        await click('Remove');

        expect(mockRequest).toHaveBeenCalledWith('removeCatalogMenu');
        expect(screen.getByText('Catalog menu removed')).toBeInTheDocument();
        expect(screen.getByText(REMOVED.summary)).toBeInTheDocument();
    });

    it('reports a request that failed outright', async () => {
        mockRequest.mockRejectedValueOnce(new Error('Request timed out'));
        open();

        await click('Build the menu from the Commerce catalog');
        await click('Build');

        expect(screen.getByText('Request timed out')).toBeInTheDocument();
    });
});
