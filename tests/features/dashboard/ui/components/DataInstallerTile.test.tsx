/**
 * The dashboard's Data Installer tile.
 *
 * Sits in the Build zone beside Integrations — both route to a dedicated
 * surface, which is what that zone holds.
 *
 * The one thing worth pinning is what it does NOT do. Integrations replaces the
 * tab: it disposes the dashboard panel and opens its surface in place, because
 * that surface is scoped to the project you came from. The datapack catalog is
 * global to the SERVICE, not to a project — the same 25 packs whatever is open —
 * so browsing it must not close what you were looking at. The command's own
 * registration says so, and this tile has to agree with it.
 *
 * Strict TDD: written BEFORE the tile exists.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { postMessage: jest.fn(), onMessage: jest.fn(() => jest.fn()) },
}));

jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({
        children,
        onPress,
        ...props
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    } & Record<string, unknown>) => (
        <button onClick={onPress} {...props}>
            {children}
        </button>
    ),
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <span role="tooltip">{children}</span>,
}));

// Below the mocks on purpose — see webview-test-authoring §3.
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import { DataInstallerTile } from '@/features/dashboard/ui/components/DataInstallerTile';

const posted = webviewClient as unknown as { postMessage: jest.Mock };

beforeEach(() => jest.clearAllMocks());

describe('DataInstallerTile', () => {
    it('names the surface it opens', () => {
        render(<DataInstallerTile />);

        expect(screen.getByText('Datapacks')).toBeInTheDocument();
    });

    it('opens the Data Installer when pressed', () => {
        render(<DataInstallerTile />);

        fireEvent.click(screen.getByText('Datapacks').closest('button')!);

        expect(posted.postMessage).toHaveBeenCalledWith('openDataInstaller');
    });

    /**
     * The message is what makes it NOT a tab replacement. `openIntegrations`
     * disposes the dashboard on the way; this one must not, so it cannot borrow
     * that message.
     */
    it('does not send the integrations message', () => {
        render(<DataInstallerTile />);

        fireEvent.click(screen.getByText('Datapacks').closest('button')!);

        expect(posted.postMessage).not.toHaveBeenCalledWith('openIntegrations');
        expect(posted.postMessage).toHaveBeenCalledTimes(1);
    });
});
