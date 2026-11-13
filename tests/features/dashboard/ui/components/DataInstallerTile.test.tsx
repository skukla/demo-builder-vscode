/**
 * The dashboard's Datapacks card.
 *
 * Its line names the demo's pack, read from the extension (`get-datapack-line`), and read again when
 * the dashboard comes back into view (owner, 2026-11-07): the sidebar's Datapacks tile opens the
 * Datapack Library, and this line is what tells the card apart from it.
 *
 * The other thing worth pinning is what it does NOT do. Integrations replaces the tab: it disposes
 * the dashboard panel and opens its surface in place. Datapacks opens beside the dashboard, so it
 * must not close what you were looking at. The command's own registration says so, and this tile
 * has to agree with it.
 */

import '../../../../helpers/webviewClientMock';
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@adobe/react-spectrum', () => {
    const { domProps } = jest.requireActual('../../../../helpers/spectrumStubProps');
    return {
        ActionButton: ({
            children,
            onPress,
            ...props
        }: {
            children?: React.ReactNode;
            onPress?: () => void;
        } & Record<string, unknown>) => (
            <button onClick={onPress} {...domProps(props)}>
                {children}
            </button>
        ),
        Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
        TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Tooltip: ({ children }: { children: React.ReactNode }) => (
            <span role="tooltip">{children}</span>
        ),
    };
});

// Below the mocks on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DataInstallerTile } from '@/features/dashboard/ui/components/DataInstallerTile';

const posted = webviewClient as unknown as { postMessage: jest.Mock; request: jest.Mock };

beforeEach(() => {
    jest.clearAllMocks();
    posted.request.mockResolvedValue({ success: true, data: { line: 'Luma, eds-compatible' } });
});

/** Render, and let the first read of the line land. */
async function renderTile(): Promise<void> {
    render(<DataInstallerTile />);
    await act(async () => undefined);
}

describe('DataInstallerTile', () => {
    it('names the surface it opens', async () => {
        await renderTile();

        expect(screen.getByText('Datapacks')).toBeInTheDocument();
    });

    it('opens the Data Installer when pressed', async () => {
        await renderTile();

        fireEvent.click(screen.getByText('Datapacks').closest('button')!);

        expect(posted.postMessage).toHaveBeenCalledWith('openDataInstaller');
    });

    /**
     * The message is what makes it NOT a tab replacement. `openIntegrations`
     * disposes the dashboard on the way; this one must not, so it cannot borrow
     * that message.
     */
    it('does not send the integrations message', async () => {
        await renderTile();

        fireEvent.click(screen.getByText('Datapacks').closest('button')!);

        expect(posted.postMessage).not.toHaveBeenCalledWith('openIntegrations');
        expect(posted.postMessage).toHaveBeenCalledTimes(1);
    });

    it('names the demo\'s pack, as the extension reads it', async () => {
        await renderTile();

        expect(posted.request).toHaveBeenCalledWith('get-datapack-line', {});
        expect(screen.getByText('Luma, eds-compatible')).toBeInTheDocument();
    });

    it('reads the line again when the dashboard comes back into view: an import changes it', async () => {
        await renderTile();
        posted.request.mockResolvedValue({ success: true, data: { line: 'Venia, eds-compatible' } });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(screen.getByText('Venia, eds-compatible')).toBeInTheDocument();
    });

    it('wears no dot while the install has not failed', async () => {
        await renderTile();

        expect(screen.queryByTestId('datapacks-failed')).not.toBeInTheDocument();
        expect(screen.getByRole('tooltip')).toHaveTextContent("Install, save or change this demo's datapack");
    });

    /** J6-4: the bare name, the error dot, and "Install failed" on hover; no reason beside the name. */
    it('wears the error dot, explained on hover, when the install failed', async () => {
        posted.request.mockResolvedValue({ success: true, data: { line: 'My Luma', failed: true } });
        await renderTile();

        expect(screen.getByTestId('datapacks-failed')).toBeInTheDocument();
        expect(screen.getByRole('tooltip')).toHaveTextContent(/^Install failed$/);
        expect(screen.getByText('My Luma')).toBeInTheDocument();
        expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Datapacks, Install failed');
    });

    it('drops the dot when a later read says the install no longer fails', async () => {
        posted.request.mockResolvedValue({ success: true, data: { line: 'My Luma', failed: true } });
        await renderTile();
        posted.request.mockResolvedValue({ success: true, data: { line: 'My Luma' } });

        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(screen.queryByTestId('datapacks-failed')).not.toBeInTheDocument();
    });

    it('shows no line when the extension cannot answer', async () => {
        posted.request.mockResolvedValue({ success: false, error: 'no' });
        await renderTile();

        expect(screen.queryByText('Luma, eds-compatible')).not.toBeInTheDocument();
        expect(screen.getByText('Datapacks')).toBeInTheDocument();
    });
});
