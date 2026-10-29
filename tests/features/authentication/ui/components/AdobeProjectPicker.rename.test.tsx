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
        createMockSelectionStep({
            items: mockProjects,
            filteredItems: mockProjects,
            hasLoadedOnce: true,
        })
    );
    return render(
        <Provider theme={defaultTheme}>
            <AdobeProjectPicker state={state as WizardState} updateState={mockUpdateState} />
        </Provider>
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
        mockRequest.mockResolvedValue({
            success: false,
            error: 'You are not a developer on every profile.',
        });
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

    it('writes the selected project back with exactly the fields a row click writes', async () => {
        renderPicker({ ...baseState, adobeProject: { ...mockProjects[0] } });

        await renameTo('Test Project 1', 'Kukla Bodea');

        // toStrictEqual: the row's `deletable` stamp must not ride into wizard state.
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
        expect(mockUpdateState.mock.calls[0][0]).toStrictEqual({
            adobeProject: {
                id: 'project1',
                name: 'project-1',
                title: 'Kukla Bodea',
                description: 'First test project',
                org_id: 'org123',
            },
        });
    });

    it('closes the field and writes nothing when no project is selected', async () => {
        renderPicker({ ...baseState, adobeProject: undefined });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.queryByLabelText('New name for Test Project 1')).not.toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(mockUpdateState).not.toHaveBeenCalled();
    });

    it('sends an undefined orgId when the wizard has no org', async () => {
        renderPicker({ ...baseState, adobeOrg: undefined });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(mockRequest).toHaveBeenCalledWith('rename-adobe-project', {
            orgId: undefined,
            projectId: 'project1',
            title: 'Kukla Bodea',
        });
    });

    it('renames against the org and selection the wizard holds NOW, not at first render', async () => {
        const view = renderPicker();
        const later: Partial<WizardState> = {
            ...baseState,
            adobeOrg: { id: 'org2', code: 'ORG2', name: 'Other Organization' },
            adobeProject: { ...mockProjects[0] },
        };
        view.rerender(
            <Provider theme={defaultTheme}>
                <AdobeProjectPicker state={later as WizardState} updateState={mockUpdateState} />
            </Provider>
        );

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(mockRequest).toHaveBeenCalledWith('rename-adobe-project', {
            orgId: 'org2',
            projectId: 'project1',
            title: 'Kukla Bodea',
        });
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
    });
});

describe('AdobeProjectPicker — a rename that does not succeed', () => {
    it('shows the fallback when the refusal carries no reason', async () => {
        mockRequest.mockResolvedValue({ success: false });
        renderPicker({ ...baseState, adobeProject: { ...mockProjects[0] } });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.getByRole('alert')).toHaveTextContent('Could not rename the project.');
        expect(mockUpdateState).not.toHaveBeenCalled();
    });

    it('shows the fallback when the handler answers with nothing at all', async () => {
        mockRequest.mockResolvedValue(undefined);
        renderPicker();

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.getByRole('alert')).toHaveTextContent('Could not rename the project.');
    });

    it("shows a rejected request's own message", async () => {
        mockRequest.mockRejectedValue(new Error('Request timed out'));
        renderPicker({ ...baseState, adobeProject: { ...mockProjects[0] } });

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.getByRole('alert')).toHaveTextContent('Request timed out');
        expect(mockUpdateState).not.toHaveBeenCalled();
    });

    it('shows the fallback when the request rejects with no message', async () => {
        mockRequest.mockRejectedValue(new Error(''));
        renderPicker();

        await renameTo('Test Project 1', 'Kukla Bodea');

        expect(screen.getByRole('alert')).toHaveTextContent('Could not rename the project.');
    });
});

// 2026-10-05: the field sat outside the row's Text slot, so the row's grid put the name
// before the selection checkbox and pushed the description aside.
describe('the row layout', () => {
    it("puts the project name in the row's text slot", () => {
        renderPicker();
        const name = screen.getByText(mockProjects[0].title || mockProjects[0].name);

        // The Spectrum mock renders Text as data-testid="spectrum-text"; real ListView
        // gives that slot the row's content grid area.
        expect(name.closest('[data-testid="spectrum-text"]')).not.toBeNull();
    });
});
