/**
 * ActionGrid Component Tests
 *
 * Tests for the zone-based dashboard action grid component.
 * Verifies zone membership, gating, overflow menu contents, Delete isolation,
 * and interactions.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionGrid } from '@/features/dashboard/ui/components/ActionGrid';
import '@testing-library/jest-dom';

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
                    <button
                        key={key}
                        role="menuitem"
                        onClick={() => onAction?.(key)}
                    >
                        {child.props?.children}
                    </button>
                );
            })}
        </div>
    ),
    Item: ({ children }: any) => <>{children}</>,
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

describe('ActionGrid', () => {
    const defaultProps = {
        isRunning: false,
        isStartDisabled: false,
        isStopDisabled: false,
        isMeshActionDisabled: false,
        isOpeningBrowser: false,
        isLogsHoverSuppressed: false,
        handleStartDemo: jest.fn(),
        handleStopDemo: jest.fn(),
        handleOpenBrowser: jest.fn(),
        handleViewLogs: jest.fn(),
        handleDeployMesh: jest.fn(),
        handleConfigure: jest.fn(),
        handleViewComponents: jest.fn(),
        handleOpenDevConsole: jest.fn(),
        handleDeleteProject: jest.fn(),
    };

    const edsProps = {
        ...defaultProps,
        isEds: true,
        authoringExperience: 'universal-editor' as const,
        handleOpenLiveSite: jest.fn(),
        handleOpenDaLive: jest.fn(),
        handleSyncStorefront: jest.fn(),
    };

    /** Resolve the zone container element for a given data-zone value. */
    const getZone = (container: HTMLElement, zone: string): HTMLElement => {
        const el = container.querySelector(`[data-zone="${zone}"]`);
        return el as HTMLElement;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('AI tile removal', () => {
        it('should not render an AI tile (AI lives in the sidebar)', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('AI')).not.toBeInTheDocument();
        });

        it('should not render an AI tile for EDS projects', () => {
            render(<ActionGrid {...edsProps} />);

            expect(screen.queryByText('AI')).not.toBeInTheDocument();
        });

        it('should not render an Open in Claude Code tile', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Open in Claude Code')).not.toBeInTheDocument();
        });
    });

    describe('Primary Cluster', () => {
        it('should label the primary cluster "Primary"', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Primary')).toBeInTheDocument();
        });

        it('should place Start in the primary cluster when not running (non-EDS)', () => {
            const { container } = render(<ActionGrid {...defaultProps} isRunning={false} />);

            const primary = getZone(container, 'primary');
            expect(primary).toBeInTheDocument();
            expect(within(primary).getByText('Start')).toBeInTheDocument();
            expect(within(primary).queryByText('Stop')).not.toBeInTheDocument();
        });

        it('should place Stop in the primary cluster when running (non-EDS)', () => {
            const { container } = render(<ActionGrid {...defaultProps} isRunning={true} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Stop')).toBeInTheDocument();
            expect(within(primary).queryByText('Start')).not.toBeInTheDocument();
        });

        it('should place Open in Browser in the primary cluster', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Open in Browser')).toBeInTheDocument();
        });

        it('should place the Author button in the primary cluster for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).getByText('Author in DA.live Classic')).toBeInTheDocument();
        });

        it('should label the Author button from the resolved experience (EW)', () => {
            render(<ActionGrid {...edsProps} authoringExperience="experience-workspace" />);

            expect(screen.getByText('Author in Experience Workspace')).toBeInTheDocument();
            expect(screen.queryByText('Author in DA.live Classic')).not.toBeInTheDocument();
        });

        it('should not render an Author button for non-EDS projects', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Author in DA.live Classic')).not.toBeInTheDocument();
            expect(screen.queryByText('Author in Experience Workspace')).not.toBeInTheDocument();
        });

        it('should mark primary tiles with the hero accent modifier class', () => {
            render(<ActionGrid {...defaultProps} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            // Mock renders UNSAFE_className as a lowercase attribute
            expect(openButton?.getAttribute('unsafe_classname')).toContain('dashboard-action-button--hero');
        });

        it('should mark the Author button with the hero accent modifier class', () => {
            render(<ActionGrid {...edsProps} />);

            const authorButton = screen.getByText('Author in DA.live Classic').closest('button');
            expect(authorButton?.getAttribute('unsafe_classname')).toContain('dashboard-action-button--hero');
        });

        it('should not render Start/Stop in the primary cluster for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const primary = getZone(container, 'primary');
            expect(within(primary).queryByText('Start')).not.toBeInTheDocument();
            expect(within(primary).queryByText('Stop')).not.toBeInTheDocument();
        });
    });

    describe('Storefront Zone (EDS only)', () => {
        it('should not render a storefront zone for non-EDS projects', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            expect(getZone(container, 'storefront')).not.toBeInTheDocument();
        });

        it('should render a storefront zone for EDS projects', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            expect(getZone(container, 'storefront')).toBeInTheDocument();
        });

        it('should label the storefront zone "Storefront"', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).getByText('Storefront')).toBeInTheDocument();
        });

        it('should place Sync Storefront in the storefront zone', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).getByText('Sync Storefront')).toBeInTheDocument();
        });

        it('should not place the Author button in the storefront zone', () => {
            const { container } = render(<ActionGrid {...edsProps} />);

            const storefront = getZone(container, 'storefront');
            expect(within(storefront).queryByText('Author in DA.live Classic')).not.toBeInTheDocument();
        });

        it('should not render Sync Storefront for non-EDS projects', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.queryByText('Sync Storefront')).not.toBeInTheDocument();
        });

        it('should not render the storefront zone when handleSyncStorefront is absent', () => {
            const { handleSyncStorefront: _handleSyncStorefront, ...edsNoSync } = edsProps;
            const { container } = render(<ActionGrid {...edsNoSync} />);

            expect(getZone(container, 'storefront')).not.toBeInTheDocument();
            expect(screen.queryByText('Sync Storefront')).not.toBeInTheDocument();
        });
    });

    describe('Build Zone', () => {
        it('should label the build zone "Build"', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).getByText('Build')).toBeInTheDocument();
        });

        it('should place Configure in the build zone', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).getByText('Configure')).toBeInTheDocument();
        });

        it('should place Logs in the build zone', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).getByText('Logs')).toBeInTheDocument();
        });

        it('should place Deploy Mesh in the build zone when hasMesh', () => {
            const { container } = render(<ActionGrid {...defaultProps} hasMesh={true} />);

            const build = getZone(container, 'build');
            expect(within(build).getByText('Deploy Mesh')).toBeInTheDocument();
        });

        it('should not render Deploy Mesh when hasMesh is false', () => {
            render(<ActionGrid {...defaultProps} hasMesh={false} />);

            expect(screen.queryByText('Deploy Mesh')).not.toBeInTheDocument();
        });
    });

    describe('Overflow Menu', () => {
        it('should render a More overflow trigger with an accessible label', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByLabelText('More actions')).toBeInTheDocument();
        });

        it('should expose Components inside the overflow menu', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(menu).toBeInTheDocument();
            expect(within(menu).getByText('Components')).toBeInTheDocument();
        });

        it('should expose Dev Console inside the overflow menu', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const menu = container.querySelector('[role="menu"]') as HTMLElement;
            expect(within(menu).getByText('Dev Console')).toBeInTheDocument();
        });

        it('should not render Components as a top-level tile', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            // Components lives only inside the overflow menu, not as a zone tile
            const buildButtons = within(build).queryAllByText('Components');
            // Any Components text present must be within the menu, not a tile button
            buildButtons.forEach((node) => {
                expect(node.closest('[role="menu"]')).toBeInTheDocument();
            });
        });

        it('should call handleViewComponents when Components menu item clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Components'));

            expect(defaultProps.handleViewComponents).toHaveBeenCalled();
        });

        it('should call handleOpenDevConsole when Dev Console menu item clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Dev Console'));

            expect(defaultProps.handleOpenDevConsole).toHaveBeenCalled();
        });
    });

    describe('Delete Footer (isolated)', () => {
        it('should render Delete outside all action zones', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const deleteFooter = getZone(container, 'delete');
            expect(deleteFooter).toBeInTheDocument();
            expect(within(deleteFooter).getByText('Delete')).toBeInTheDocument();
        });

        it('should not place Delete inside the build zone', () => {
            const { container } = render(<ActionGrid {...defaultProps} />);

            const build = getZone(container, 'build');
            expect(within(build).queryByText('Delete')).not.toBeInTheDocument();
        });

        it('should mark Delete with the destructive modifier class', () => {
            render(<ActionGrid {...defaultProps} />);

            const deleteButton = screen.getByText('Delete').closest('button');
            expect(deleteButton?.getAttribute('unsafe_classname')).toContain('dashboard-action-button--destructive');
        });

        it('should call handleDeleteProject when Delete clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Delete'));

            expect(defaultProps.handleDeleteProject).toHaveBeenCalled();
        });
    });

    describe('Open Browser Gating', () => {
        it('should disable Open button when not running (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });

        it('should enable Open button when running (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).not.toBeDisabled();
        });

        it('should disable Open button when isOpeningBrowser is true (non-EDS)', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isOpeningBrowser={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });

        it('should disable EDS Open in Browser only while isOpeningBrowser', () => {
            render(<ActionGrid {...edsProps} isOpeningBrowser={false} />);
            expect(screen.getByText('Open in Browser').closest('button')).not.toBeDisabled();
        });

        it('should disable EDS Open in Browser when isOpeningBrowser is true', () => {
            render(<ActionGrid {...edsProps} isOpeningBrowser={true} />);
            expect(screen.getByText('Open in Browser').closest('button')).toBeDisabled();
        });
    });

    describe('Start/Stop Gating', () => {
        it('should disable Start when isStartDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} isStartDisabled={true} />);

            expect(screen.getByText('Start').closest('button')).toBeDisabled();
        });

        it('should disable Stop when isStopDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isStopDisabled={true} />);

            expect(screen.getByText('Stop').closest('button')).toBeDisabled();
        });
    });

    describe('Mesh Action Disabled State', () => {
        it('should disable Deploy Mesh when isMeshActionDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isMeshActionDisabled={true} />);

            const deployButton = screen.getByText('Deploy Mesh').closest('button');
            expect(deployButton).toBeDisabled();
        });

        it('should disable Configure when isMeshActionDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isMeshActionDisabled={true} />);

            const configureButton = screen.getByText('Configure').closest('button');
            expect(configureButton).toBeDisabled();
        });
    });

    describe('Logs Hover Suppression', () => {
        it('should apply hover-suppressed class when isLogsHoverSuppressed is true', () => {
            render(<ActionGrid {...defaultProps} isLogsHoverSuppressed={true} />);

            const logsButton = screen.getByText('Logs').closest('button');
            expect(logsButton?.getAttribute('unsafe_classname')).toContain('hover-suppressed');
        });

        it('should not apply hover-suppressed class when isLogsHoverSuppressed is false', () => {
            render(<ActionGrid {...defaultProps} isLogsHoverSuppressed={false} />);

            const logsButton = screen.getByText('Logs').closest('button');
            expect(logsButton?.getAttribute('unsafe_classname')).not.toContain('hover-suppressed');
        });
    });

    describe('Button Interactions', () => {
        it('should call handleStartDemo when Start clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            await user.click(screen.getByText('Start'));

            expect(defaultProps.handleStartDemo).toHaveBeenCalled();
        });

        it('should call handleStopDemo when Stop clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            await user.click(screen.getByText('Stop'));

            expect(defaultProps.handleStopDemo).toHaveBeenCalled();
        });

        it('should call handleOpenBrowser when Open clicked (non-EDS)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            await user.click(screen.getByText('Open in Browser'));

            expect(defaultProps.handleOpenBrowser).toHaveBeenCalled();
        });

        it('should call handleViewLogs when Logs clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Logs'));

            expect(defaultProps.handleViewLogs).toHaveBeenCalled();
        });

        it('should call handleDeployMesh when Deploy Mesh clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Deploy Mesh'));

            expect(defaultProps.handleDeployMesh).toHaveBeenCalled();
        });

        it('should call handleConfigure when Configure clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Configure'));

            expect(defaultProps.handleConfigure).toHaveBeenCalled();
        });
    });

    describe('EDS-Specific Interactions', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should call handleOpenLiveSite when Open in Browser clicked (EDS)', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Open in Browser'));

            expect(edsProps.handleOpenLiveSite).toHaveBeenCalled();
        });

        it('should call handleOpenDaLive when the Author button clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Author in DA.live Classic'));

            expect(edsProps.handleOpenDaLive).toHaveBeenCalled();
        });

        it('labels the Author button for the resolved experience (EW)', () => {
            render(<ActionGrid {...edsProps} authoringExperience="experience-workspace" />);

            expect(screen.getByText('Author in Experience Workspace')).toBeInTheDocument();
        });

        it('renders no authoring-experience flip/switch control (relocated to Configure)', () => {
            // The flip control moved to the Configure webview (setup-time preference).
            render(<ActionGrid {...edsProps} authoringExperience="universal-editor" />);

            expect(screen.queryByText('Switch to Experience Workspace')).not.toBeInTheDocument();
            expect(screen.queryByText('Switch to DA.live Classic')).not.toBeInTheDocument();
        });

        it('should call handleSyncStorefront when Sync Storefront clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Sync Storefront'));

            expect(edsProps.handleSyncStorefront).toHaveBeenCalled();
        });
    });
});
