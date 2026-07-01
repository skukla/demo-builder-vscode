/**
 * AdobeEntityFields tests — the "browse or create" controls for the Adobe I/O target.
 *
 * Pins the create-flow wiring against the ported handlers, matching the GitHub
 * browse/create look + feel:
 *  - the "New" header button is ALWAYS offered (no permission pre-flight probe);
 *  - clicking "New" reveals the create panel; "Create" sends `create-adobe-project` /
 *    `create-adobe-workspace` with the typed name and, on success, writes
 *    `adobeProject` / `adobeWorkspace` and returns to browse;
 *  - a failed create — including a permission denial (`AUTH_FORBIDDEN`) — surfaces the
 *    error inline (no state write, stays on the panel). Honest by attempt, not by probe.
 *
 * The selection pickers are mocked to sentinels that RENDER their `headerAction` (so the
 * "New" button is observable); the webview request layer is mocked so the handler
 * protocol is observable.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import type { WizardState } from '@/types/webview';

const request = jest.fn();
jest.mock('@/core/ui/utils/WebviewClient', () => ({
    webviewClient: { request: (...args: unknown[]) => request(...args) },
}));
jest.mock('@/features/authentication/ui/components/AdobeProjectPicker', () => ({
    AdobeProjectPicker: ({ headerAction }: { headerAction?: React.ReactNode }) => (
        <div data-testid="project-picker">{headerAction}</div>
    ),
}));
jest.mock('@/features/authentication/ui/components/AdobeWorkspacePicker', () => ({
    AdobeWorkspacePicker: ({ headerAction }: { headerAction?: React.ReactNode }) => (
        <div data-testid="workspace-picker">{headerAction}</div>
    ),
}));

const EMPTY = {} as WizardState;

function renderField(node: React.ReactElement) {
    return render(<Provider theme={defaultTheme}>{node}</Provider>);
}

/** Route create calls through `impl`; anything else resolves success. */
function mockRequests(impl?: (type: string, payload?: unknown) => unknown) {
    request.mockImplementation((type: string, payload?: unknown) =>
        Promise.resolve(impl ? impl(type, payload) : { success: true }),
    );
}

beforeEach(() => request.mockReset());

describe('AdobeProjectField', () => {
    it('renders the selection picker with the "New" button always offered', () => {
        mockRequests();
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} />);
        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    });

    it('shows "New" and creates → writes adobeProject + returns to browse', async () => {
        const updateState = jest.fn();
        mockRequests((type) =>
            type === 'create-adobe-project'
                ? { success: true, data: { id: 'p9', name: 'np', title: 'New Project' } }
                : { success: true },
        );
        renderField(<AdobeProjectField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: 'New' }));
        // Now on the create panel.
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'np' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(request).toHaveBeenCalledWith('create-adobe-project', { name: 'np' }),
        );
        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeProject: expect.objectContaining({ id: 'p9' }) }),
            ),
        );
        // Snaps back to the browse list on success.
        await waitFor(() => expect(screen.getByTestId('project-picker')).toBeInTheDocument());
    });

    it('telegraphs a permission denial from Create inline (no pre-flight probe)', async () => {
        const updateState = jest.fn();
        mockRequests((type) =>
            type === 'create-adobe-project'
                ? {
                      success: false,
                      code: 'AUTH_FORBIDDEN',
                      error:
                          'You do not have permission to create projects in this organization. '
                          + 'Select an existing project instead.',
                  }
                : { success: true },
        );
        renderField(<AdobeProjectField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: 'New' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'np' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        expect(
            await screen.findByText(/do not have permission to create projects/i),
        ).toBeInTheDocument();
        expect(updateState).not.toHaveBeenCalled();
        // Stays on the panel so the user can adjust or Browse.
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
    });

    it('surfaces a generic create error inline and stays on the panel (no state write)', async () => {
        const updateState = jest.fn();
        mockRequests((type) =>
            type === 'create-adobe-project'
                ? { success: false, error: 'Name already exists' }
                : { success: true },
        );
        renderField(<AdobeProjectField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: 'New' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'dup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        expect(await screen.findByText('Name already exists')).toBeInTheDocument();
        expect(updateState).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
    });

    it('Browse returns to the list without creating', async () => {
        mockRequests();
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} />);

        fireEvent.click(await screen.findByRole('button', { name: 'New' }));
        expect(screen.getByRole('heading', { name: 'Create New Project' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        expect(request).not.toHaveBeenCalledWith('create-adobe-project', expect.anything());
    });
});

describe('AdobeWorkspaceField', () => {
    it('offers "New" and creates a workspace → writes adobeWorkspace', async () => {
        const updateState = jest.fn();
        mockRequests((type) =>
            type === 'create-adobe-workspace'
                ? { success: true, data: { id: 'w9', name: 'nw', title: 'New WS' } }
                : { success: true },
        );
        renderField(<AdobeWorkspaceField state={EMPTY} updateState={updateState} />);

        fireEvent.click(await screen.findByRole('button', { name: 'New' }));
        expect(screen.getByRole('heading', { name: 'Create New Workspace' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'nw' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() =>
            expect(request).toHaveBeenCalledWith('create-adobe-workspace', { name: 'nw' }),
        );
        await waitFor(() =>
            expect(updateState).toHaveBeenCalledWith(
                expect.objectContaining({ adobeWorkspace: expect.objectContaining({ id: 'w9' }) }),
            ),
        );
    });
});
