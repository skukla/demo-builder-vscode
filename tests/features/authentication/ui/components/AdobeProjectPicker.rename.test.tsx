/**
 * AdobeProjectPicker — renaming a project from its row: the pencil opens the title
 * for editing, Enter asks the extension to rename it, a refusal stays inline.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { AdobeProjectPicker } from '@/features/authentication/ui/components/AdobeProjectPicker';
import { WizardState } from '@/types/webview';
import '@testing-library/jest-dom';
import { mockProjects, baseState, createMockSelectionStep } from './AdobeProjectPicker.testUtils';

const mockRequest = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: {
        postMessage: jest.fn(),
        request: (...args: unknown[]) => mockRequest(...args),
        onMessage: jest.fn(() => jest.fn()),
    },
}));

jest.mock('@/core/ui/hooks/useSelectionStep', () => ({
    useSelectionStep: jest.fn(),
}));

jest.mock('@/core/ui/components/feedback/LoadingDisplay', () => ({
    LoadingDisplay: ({ message }: { message: string }) => <div>{message}</div>,
}));

import { useSelectionStep } from '@/core/ui/hooks/useSelectionStep';

const mockUpdateState = jest.fn();

function renderPicker(state: Partial<WizardState> = baseState) {
    (useSelectionStep as jest.Mock).mockImplementation(() =>
        createMockSelectionStep({ items: mockProjects, filteredItems: mockProjects, hasLoadedOnce: true }),
    );
    return render(
        <Provider theme={defaultTheme}>
            <AdobeProjectPicker state={state as WizardState} updateState={mockUpdateState} />
        </Provider>,
    );
}

/** Open a row's title for editing, type a new one, and press Enter. */
async function renameTo(current: string, next: string): Promise<void> {
    fireEvent.click(screen.getByLabelText(`Rename ${current}`));
    const input = screen.getByLabelText(`New name for ${current}`);
    fireEvent.change(input, { target: { value: next } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await act(async () => {
        await Promise.resolve();
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ success: true });
});

describe('AdobeProjectPicker — rename', () => {
    it("asks the extension to rename the row's project in the selected org", async () => {
        renderPicker();

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(mockRequest).toHaveBeenCalledWith('rename-adobe-project', {
            orgId: 'org1',
            projectId: 'project1',
            title: 'Kukla Bodea',
        });
    });

    it("shows Adobe's refusal under the field and keeps it open", async () => {
        mockRequest.mockResolvedValue({ success: false, error: 'You are not a developer on every profile.' });
        renderPicker();

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.getByText('You are not a developer on every profile.')).toBeInTheDocument();
        expect(screen.getByLabelText('New name for Test Project 1')).toBeInTheDocument();
    });

    it('carries the new title into the selected project', async () => {
        renderPicker({ ...baseState, adobeProject: { ...mockProjects[0] } });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(mockUpdateState).toHaveBeenCalledWith({
            adobeProject: expect.objectContaining({ id: 'project1', title: 'Kukla Bodea' }),
        });
    });

    it('leaves the selection alone when another project is renamed', async () => {
        renderPicker({ ...baseState, adobeProject: { ...mockProjects[1] } });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(mockUpdateState).not.toHaveBeenCalled();
    });
});
