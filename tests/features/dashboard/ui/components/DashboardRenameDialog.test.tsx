/**
 * DashboardRenameDialog Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Stub the underlying projects-list dialog (Spectrum internals not under test here)
jest.mock('@/features/projects-dashboard/ui/components/RenameProjectDialog', () => ({
    RenameProjectDialog: ({ project, onRename, onClose }: any) => (
        <div data-testid="rename-dialog">
            <span data-testid="rename-dialog-name">{project?.name}</span>
            <span data-testid="rename-dialog-path">{project?.path}</span>
            <button data-testid="confirm" onClick={() => onRename('next')}>confirm</button>
            <button data-testid="close" onClick={onClose}>close</button>
        </div>
    ),
}));

// The DialogContainer is the modal overlay host the dialog needs to present.
// Mock it to a passthrough so the wrapper's open/closed gating is observable.
jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children }: any) => <div data-testid="dialog-container">{children}</div>,
}));

import { DashboardRenameDialog } from '@/features/dashboard/ui/components/DashboardRenameDialog';

describe('DashboardRenameDialog', () => {
    const baseProps = {
        projectName: 'My Project',
        projectPath: '/p/my-project',
        onRename: jest.fn(),
        onClose: jest.fn(),
    };

    beforeEach(() => jest.clearAllMocks());

    it('hosts a DialogContainer but renders no dialog when closed', () => {
        render(<DashboardRenameDialog {...baseProps} isOpen={false} />);

        // The DialogContainer (overlay host) is always mounted; the dialog is not.
        expect(screen.getByTestId('dialog-container')).toBeInTheDocument();
        expect(screen.queryByTestId('rename-dialog')).not.toBeInTheDocument();
    });

    it('should render the dialog inside the DialogContainer when open', () => {
        render(<DashboardRenameDialog {...baseProps} isOpen />);

        expect(screen.getByTestId('dialog-container')).toBeInTheDocument();
        expect(screen.getByTestId('rename-dialog')).toBeInTheDocument();
        expect(screen.getByTestId('rename-dialog-name')).toHaveTextContent('My Project');
        expect(screen.getByTestId('rename-dialog-path')).toHaveTextContent('/p/my-project');
    });

    it('should default the path to empty string when not provided', () => {
        render(<DashboardRenameDialog {...baseProps} projectPath={undefined} isOpen />);

        expect(screen.getByTestId('rename-dialog-path')).toHaveTextContent('');
    });

    it('should forward onRename', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(<DashboardRenameDialog {...baseProps} isOpen />);

        await user.click(screen.getByTestId('confirm'));

        expect(baseProps.onRename).toHaveBeenCalledWith('next');
    });

    it('should forward onClose', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        render(<DashboardRenameDialog {...baseProps} isOpen />);

        await user.click(screen.getByTestId('close'));

        expect(baseProps.onClose).toHaveBeenCalled();
    });
});
