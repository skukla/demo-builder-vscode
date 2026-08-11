/**
 * Shared harness for the ActionGrid suites.
 *
 * The mock preamble and the SUT import live together HERE on purpose.
 * `babel-plugin-jest-hoist` lifts `jest.mock` above the imports of the module it
 * appears in — not across modules — so a spec importing ActionGrid directly
 * would bind it to real Spectrum before these mocks registered. Specs import
 * ActionGrid from this file instead.
 */

import React from 'react';

// Mock Adobe React Spectrum components.
// MenuTrigger/Menu/Item are mocked so overflow items render as clickable buttons:
// each Item becomes a <button> that fires the Menu's onAction with the Item's key,
// preserving the existing getByText(...).closest('button') click-assertion pattern.
jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    MenuTrigger: ({ children }: any) => <div data-testid="menu-trigger">{children}</div>,
    Menu: ({ children, onAction }: any) => (
        <div role="menu">
            {React.Children.map(children, (child: any) => {
                if (!child) return null;
                const key = child.key ?? child.props?.['data-key'];
                return (
                    <button key={key} role="menuitem" onClick={() => onAction?.(key)}>
                        {child.props?.children}
                    </button>
                );
            })}
        </div>
    ),
    Item: ({ children }: any) => <>{children}</>,
    // The remedy tiles wrap their button in a TooltipTrigger. Both render
    // inline so the tooltip text is queryable without a hover.
    TooltipTrigger: ({ children }: any) => <>{children}</>,
    Tooltip: ({ children }: any) => <span role="tooltip">{children}</span>,
    // StatusCard renders its remediation action as a Link. Added when artifact
    // status moved into the zones — a per-suite Spectrum mock only exports what
    // the tree rendered when it was written, and the action branch is new here.
    Link: ({ children, onPress, ...props }: any) => (
        <span role="link" tabIndex={0} onClick={onPress} {...props}>
            {children}
        </span>
    ),
}));

// Mock Spectrum icons
jest.mock('@spectrum-icons/workflow/PlayCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="play-icon" />,
}));
jest.mock('@spectrum-icons/workflow/StopCircle', () => ({
    __esModule: true,
    default: () => <span data-testid="stop-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Globe', () => ({
    __esModule: true,
    default: () => <span data-testid="globe-icon" />,
}));
jest.mock('@spectrum-icons/workflow/ViewList', () => ({
    __esModule: true,
    default: () => <span data-testid="viewlist-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Refresh', () => ({
    __esModule: true,
    default: () => <span data-testid="refresh-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Settings', () => ({
    __esModule: true,
    default: () => <span data-testid="settings-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Delete', () => ({
    __esModule: true,
    default: () => <span data-testid="delete-icon" />,
}));

// Mock EDS-specific icons
jest.mock('@spectrum-icons/workflow/PublishCheck', () => ({
    __esModule: true,
    default: () => <span data-testid="publish-icon" />,
}));
jest.mock('@spectrum-icons/workflow/More', () => ({
    __esModule: true,
    default: () => <span data-testid="more-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Edit', () => ({
    __esModule: true,
    default: () => <span data-testid="edit-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Replay', () => ({
    __esModule: true,
    default: () => <span data-testid="replay-icon" />,
}));


// Imported AFTER the mocks above, and re-exported so no spec reaches for the
// real module. See the file header — this ordering is the whole point.
import { ActionGrid } from '@/features/dashboard/ui/components/ActionGrid';

export { ActionGrid };

export const defaultProps = {
    isRunning: false,
    isStartDisabled: false,
    isStopDisabled: false,
    isMeshActionDisabled: false,
    isOpeningBrowser: false,
    handleStartDemo: jest.fn(),
    handleStopDemo: jest.fn(),
    handleOpenBrowser: jest.fn(),
    handleOpenAdminPanel: jest.fn(),
    handleConfigure: jest.fn(),
    handleOpenDevConsole: jest.fn(),
    handleDeleteProject: jest.fn(),
    handleEditProject: jest.fn(),
    handleExportProject: jest.fn(),
    handleResetProject: jest.fn(),
    handleRestartDemo: jest.fn(),
};

export const edsProps = {
    ...defaultProps,
    isEds: true,
    authoringExperience: 'da-live-classic' as const,
    handleOpenLiveSite: jest.fn(),
    handleOpenDaLive: jest.fn(),
    handleSyncStorefront: jest.fn(),
    handleRepublishContent: jest.fn(),
};

/** Resolve the zone container element for a given data-zone value. */
export const getZone = (container: HTMLElement, zone: string): HTMLElement =>
    container.querySelector(`[data-zone="${zone}"]`) as HTMLElement;
