/**
 * ActionGrid Component Tests
 *
 * Tests for the extracted dashboard action grid component.
 * Verifies button rendering and interactions.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionGrid } from '@/features/dashboard/ui/components/ActionGrid';
import '@testing-library/jest-dom';

// Mock Adobe React Spectrum components
jest.mock('@adobe/react-spectrum', () => ({
    ActionButton: ({ children, onPress, isDisabled, ...props }: any) => (
        <button onClick={onPress} disabled={isDisabled} {...props}>
            {children}
        </button>
    ),
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
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
jest.mock('@spectrum-icons/workflow/FolderOpen', () => ({
    __esModule: true,
    default: () => <span data-testid="folder-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Code', () => ({
    __esModule: true,
    default: () => <span data-testid="code-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Delete', () => ({
    __esModule: true,
    default: () => <span data-testid="delete-icon" />,
}));

// Mock GridLayout
jest.mock('@/core/ui/components/layout', () => ({
    GridLayout: ({ children }: any) => <div data-testid="grid-layout">{children}</div>,
}));

// Mock EDS-specific icons
jest.mock('@spectrum-icons/workflow/PublishCheck', () => ({
    __esModule: true,
    default: () => <span data-testid="publish-icon" />,
}));
jest.mock('@spectrum-icons/workflow/Revert', () => ({
    __esModule: true,
    default: () => <span data-testid="revert-icon" />,
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

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Start/Stop Button Rendering', () => {
        it('should render Start button when not running', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            expect(screen.getByText('Start')).toBeInTheDocument();
            expect(screen.queryByText('Stop')).not.toBeInTheDocument();
        });

        it('should render Stop button when running', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            expect(screen.getByText('Stop')).toBeInTheDocument();
            expect(screen.queryByText('Start')).not.toBeInTheDocument();
        });

        it('should disable Start button when isStartDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} isStartDisabled={true} />);

            const startButton = screen.getByText('Start').closest('button');
            expect(startButton).toBeDisabled();
        });

        it('should disable Stop button when isStopDisabled is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isStopDisabled={true} />);

            const stopButton = screen.getByText('Stop').closest('button');
            expect(stopButton).toBeDisabled();
        });
    });

    describe('Open Browser Button', () => {
        it('should render Open in Browser button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
        });

        it('should disable Open button when not running', () => {
            render(<ActionGrid {...defaultProps} isRunning={false} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });

        it('should enable Open button when running', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).not.toBeDisabled();
        });

        it('should disable Open button when isOpeningBrowser is true', () => {
            render(<ActionGrid {...defaultProps} isRunning={true} isOpeningBrowser={true} />);

            const openButton = screen.getByText('Open in Browser').closest('button');
            expect(openButton).toBeDisabled();
        });
    });

    describe('Common Buttons', () => {
        it('should render Logs button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Logs')).toBeInTheDocument();
        });

        it('should render Deploy Mesh button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Deploy Mesh')).toBeInTheDocument();
        });

        it('should render Configure button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Configure')).toBeInTheDocument();
        });

        it('should render Components button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Components')).toBeInTheDocument();
        });

        it('should render Dev Console button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Dev Console')).toBeInTheDocument();
        });

        it('should render Delete button', () => {
            render(<ActionGrid {...defaultProps} />);

            expect(screen.getByText('Delete')).toBeInTheDocument();
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

        it('should call handleOpenBrowser when Open clicked', async () => {
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

        it('should call handleViewComponents when Components clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Components'));

            expect(defaultProps.handleViewComponents).toHaveBeenCalled();
        });

        it('should call handleOpenDevConsole when Dev Console clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Dev Console'));

            expect(defaultProps.handleOpenDevConsole).toHaveBeenCalled();
        });

        it('should call handleDeleteProject when Delete clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...defaultProps} />);

            await user.click(screen.getByText('Delete'));

            expect(defaultProps.handleDeleteProject).toHaveBeenCalled();
        });
    });

    describe('Logs Hover Suppression', () => {
        it('should apply hover-suppressed class when isLogsHoverSuppressed is true', () => {
            render(<ActionGrid {...defaultProps} isLogsHoverSuppressed={true} />);

            const logsButton = screen.getByText('Logs').closest('button');
            // Mock renders UNSAFE_className as lowercase attribute
            expect(logsButton?.getAttribute('unsafe_classname')).toContain('hover-suppressed');
        });

        it('should not apply hover-suppressed class when isLogsHoverSuppressed is false', () => {
            render(<ActionGrid {...defaultProps} isLogsHoverSuppressed={false} />);

            const logsButton = screen.getByText('Logs').closest('button');
            // Mock renders UNSAFE_className as lowercase attribute
            expect(logsButton?.getAttribute('unsafe_classname')).not.toContain('hover-suppressed');
        });
    });

    describe('Grid Structure', () => {
        it('should render exactly 8 action buttons (Start/Stop are mutually exclusive)', () => {
            render(<ActionGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            // 8 buttons: Start OR Stop (exclusive) + Open + Logs + Deploy Mesh + Configure + Components + Dev Console + Delete
            expect(buttons).toHaveLength(8);
        });
    });

    describe('EDS-Specific Buttons', () => {
        // Note: EDS Publish and Reset actions are available via the project card kebab menu,
        // not on this dashboard detail view. See ActionGrid.tsx header comment.
        const edsProps = {
            ...defaultProps,
            isEds: true,
            handleOpenLiveSite: jest.fn(),
            handleOpenDaLive: jest.fn(),
        };

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should render Open in Browser button for EDS projects', () => {
            render(<ActionGrid {...edsProps} />);

            expect(screen.getByText('Open in Browser')).toBeInTheDocument();
        });

        it('should render Author in DA.live button for EDS projects', () => {
            render(<ActionGrid {...edsProps} />);

            expect(screen.getByText('Author in DA.live')).toBeInTheDocument();
        });

        it('should not render Start/Stop buttons for EDS projects', () => {
            render(<ActionGrid {...edsProps} />);

            expect(screen.queryByText('Start')).not.toBeInTheDocument();
            expect(screen.queryByText('Stop')).not.toBeInTheDocument();
        });

        it('should call handleOpenLiveSite when Open in Browser clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Open in Browser'));

            expect(edsProps.handleOpenLiveSite).toHaveBeenCalled();
        });

        it('should call handleOpenDaLive when Author in DA.live clicked', async () => {
            const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
            render(<ActionGrid {...edsProps} />);

            await user.click(screen.getByText('Author in DA.live'));

            expect(edsProps.handleOpenDaLive).toHaveBeenCalled();
        });
    });
});
