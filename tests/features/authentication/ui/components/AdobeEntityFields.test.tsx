/**
 * AdobeEntityFields tests — the Adobe I/O project and workspace lists with their "New" button.
 *
 * New is ALWAYS offered (no permission pre-flight probe) and only REPORTS through `onNew`:
 * naming the new project or workspace is the caller's create window (walk F286), covered by
 * AddIntegrationFlowModal.create.test.tsx. The selection pickers are mocked to sentinels that
 * RENDER their `headerAction` and the dialog's empty-list New, so both are observable.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import '@testing-library/jest-dom';
import {
    AdobeProjectField,
    AdobeWorkspaceField,
} from '@/features/authentication/ui/components/AdobeEntityFields';
import type { WizardState } from '@/types/webview';

jest.mock('@/features/authentication/ui/components/AdobeProjectPicker', () => ({
    AdobeProjectPicker: ({ headerAction, dialogHost }: { headerAction?: React.ReactNode; dialogHost?: { onCreate: () => void } }) => (
        <div data-testid="project-picker">
            {headerAction}
            {dialogHost && <button type="button" onClick={dialogHost.onCreate}>empty-list-new</button>}
        </div>
    ),
}));
jest.mock('@/features/authentication/ui/components/AdobeWorkspacePicker', () => ({
    AdobeWorkspacePicker: ({
        headerAction,
        selectedWorkspaceId,
        onWorkspaceSelect,
        dialogHost,
    }: {
        dialogHost?: { onCreate: () => void };
        headerAction?: React.ReactNode;
        selectedWorkspaceId?: string;
        onWorkspaceSelect?: (ws: { id: string; name: string; title?: string }) => void;
    }) => (
        <div data-testid="workspace-picker" data-selected={selectedWorkspaceId ?? ''}>
            {headerAction}
            {dialogHost && <button type="button" onClick={dialogHost.onCreate}>empty-list-new</button>}
            <button
                type="button"
                onClick={() => onWorkspaceSelect?.({ id: 'w9', name: 'nw', title: 'New WS' })}
            >
                pick-ws
            </button>
        </div>
    ),
}));

const EMPTY = {} as WizardState;

function renderField(node: React.ReactElement) {
    return render(<Provider theme={defaultTheme}>{node}</Provider>);
}

describe('New over each list', () => {
    it('is always offered over the projects, and reports New', () => {
        const onNew = jest.fn();
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} onNew={onNew} />);
        expect(screen.getByTestId('project-picker')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'New' }));

        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('is always offered over the workspaces, and reports New', () => {
        const onNew = jest.fn();
        renderField(<AdobeWorkspaceField state={EMPTY} updateState={jest.fn()} onNew={onNew} />);

        fireEvent.click(screen.getByRole('button', { name: 'New' }));

        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('opens no form of its own: the list stays', () => {
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} onNew={jest.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'New' }));

        expect(screen.getByTestId('project-picker')).toBeInTheDocument();
        expect(screen.queryByText('Create New Project')).toBeNull();
    });
});

describe('AdobeWorkspaceField — pending-default overrides (Adobe I/O sub-step)', () => {
    it('threads selectedWorkspaceId + onWorkspaceSelect down to the picker', () => {
        const onWorkspaceSelect = jest.fn();
        renderField(
            <AdobeWorkspaceField
                state={EMPTY}
                updateState={jest.fn()}
                onNew={jest.fn()}
                selectedWorkspaceId="w-pending"
                onWorkspaceSelect={onWorkspaceSelect}
            />,
        );

        expect(screen.getByTestId('workspace-picker')).toHaveAttribute('data-selected', 'w-pending');
        fireEvent.click(screen.getByRole('button', { name: 'pick-ws' }));
        expect(onWorkspaceSelect).toHaveBeenCalledWith({ id: 'w9', name: 'nw', title: 'New WS' });
    });

    it('passes neither prop by default', () => {
        renderField(<AdobeWorkspaceField state={EMPTY} updateState={jest.fn()} onNew={jest.fn()} />);
        expect(screen.getByTestId('workspace-picker')).toHaveAttribute('data-selected', '');
    });
});

// An empty list in a dialog offers New in the footer: the same New as the header button.
describe('the dialog\'s New on an empty list', () => {
    const FRAME = { onOutcome: jest.fn(), onWaiting: jest.fn() };

    it('reports New for the projects', () => {
        const onNew = jest.fn();
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} onNew={onNew} dialogHost={FRAME} />);
        fireEvent.click(screen.getByRole('button', { name: 'empty-list-new' }));

        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('reports New for the workspaces', () => {
        const onNew = jest.fn();
        renderField(<AdobeWorkspaceField state={EMPTY} updateState={jest.fn()} onNew={onNew} dialogHost={FRAME} />);
        fireEvent.click(screen.getByRole('button', { name: 'empty-list-new' }));

        expect(onNew).toHaveBeenCalledTimes(1);
    });

    it('CONTROL: a field not in a dialog hands the picker no host', () => {
        renderField(<AdobeProjectField state={EMPTY} updateState={jest.fn()} onNew={jest.fn()} />);

        expect(screen.queryByRole('button', { name: 'empty-list-new' })).toBeNull();
    });
});
