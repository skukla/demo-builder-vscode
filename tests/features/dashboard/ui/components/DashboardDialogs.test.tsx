/**
 * DashboardDialogs — which dialog is mounted over the project dashboard, and
 * what each one is handed.
 *
 * Every dialog is a stub that records its props: their own suites render them
 * for real. What this suite pins is the WIRING — the open flags decide what is
 * mounted, and each dialog receives the right data and the right close.
 */

import { mockPostMessage } from '../../../../helpers/webviewClientMock';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import {
    DashboardDialogs,
    type AiCapabilityState,
    type DashboardDialogsProps,
} from '@/features/dashboard/ui/components/DashboardDialogs';
import type { HandoverDialogs } from '@/features/dashboard/ui/hooks/useHandoverDialogs';
import type { OperationRunnerControls, ScreenOperation } from '@/core/ui/hooks/useOperationRunner';

const mockAddDemoModal = jest.fn();
const mockExportModal = jest.fn();
const mockDemoPackageModal = jest.fn();
const mockProgressModal = jest.fn();
const mockCapabilitiesModal = jest.fn();

jest.mock('@adobe/react-spectrum', () => ({
    DialogContainer: ({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) => (
        <div data-testid="dialog-container">
            <button onClick={onDismiss}>Dismiss</button>
            {children}
        </div>
    ),
}));
jest.mock('@/features/project-creation/ui/components/add-demo/AddDemoModal', () => ({
    AddDemoModal: (props: { onDemoAdded: () => void; onClose: () => void; onUseShipped: () => unknown }) => {
        mockAddDemoModal(props);
        return (
            <div role="dialog" aria-label="Change source">
                <button onClick={() => props.onDemoAdded()}>Use this demo</button>
                <button onClick={props.onClose}>Close source</button>
            </div>
        );
    },
}));
jest.mock('@/features/dashboard/ui/components/export/ExportModal', () => ({
    ExportModal: (props: { onClose: () => void }) => {
        mockExportModal(props);
        return <div role="dialog" aria-label="Export" />;
    },
}));
jest.mock('@/features/dashboard/ui/components/demo-package/DemoPackageModal', () => ({
    DemoPackageModal: (props: { onClose: () => void }) => {
        mockDemoPackageModal(props);
        return <div role="dialog" aria-label="Save as demo package" />;
    },
}));
jest.mock('@/core/ui/components/feedback/OperationProgressModal', () => ({
    OperationProgressModal: (props: unknown) => {
        mockProgressModal(props);
        return null;
    },
}));
jest.mock('@/features/dashboard/ui/components/AiCapabilitiesModal', () => ({
    AiCapabilitiesModal: (props: { onClose: () => void; onRegenerate: () => void }) => {
        mockCapabilitiesModal(props);
        return (
            <div role="dialog" aria-label="AI capabilities">
                <button onClick={props.onClose}>Close capabilities</button>
                <button onClick={() => props.onRegenerate()}>Regenerate</button>
            </div>
        );
    },
}));

const DEMO: NonNullable<DashboardDialogsProps['changeSourceDemo']> = {
    name: 'Isle5 by Jen',
    source: { owner: 'jen', repo: 'isle5-demo' },
    storefrontKind: 'eds',
    demoPackageName: 'Isle5',
};

const RESET_OPERATION: ScreenOperation = {
    id: 'reset-project',
    name: 'My Demo',
    message: 'resetProject',
    title: 'Resetting My Demo',
    failureTitle: "Couldn't reset My Demo",
    successTitle: 'My Demo reset',
    run: 1,
    resume: false,
};

function handover(overrides: Partial<HandoverDialogs> = {}): HandoverDialogs {
    return {
        exportOpen: false,
        demoPackageOpen: false,
        openExport: jest.fn(),
        closeExport: jest.fn(),
        closeDemoPackage: jest.fn(),
        ...overrides,
    };
}

function operations(): OperationRunnerControls {
    return {
        open: RESET_OPERATION,
        start: jest.fn(),
        startWhenItBegins: jest.fn(),
        show: jest.fn(),
        reopen: jest.fn(() => false),
        retry: jest.fn(),
        close: jest.fn(),
    };
}

function ai(overrides: Partial<AiCapabilityState> = {}): AiCapabilityState {
    return {
        aiSkills: [{ name: 'demo-builder', description: null, path: '/p/skill.md', source: 'demo-builder' }],
        aiMcps: [],
        aiSkillsError: true,
        aiMcpsError: false,
        aiEditedFiles: ['AGENTS.md'],
        aiGatedSkills: [{ file: 'erp.md', toolId: 'erp', reason: 'tool-missing' }],
        aiInventoryLoading: false,
        aiBusy: true,
        aiRegenProgress: null,
        aiRegenError: 'Tooling install failed',
        regenerateAiFiles: jest.fn(() => Promise.resolve()),
        ...overrides,
    };
}

function props(overrides: Partial<DashboardDialogsProps> = {}): DashboardDialogsProps {
    return {
        isEds: false,
        onCloseChangeSource: jest.fn(),
        handover: handover(),
        operations: operations(),
        capabilitiesOpen: false,
        onCloseCapabilities: jest.fn(),
        ai: ai(),
        ...overrides,
    };
}

describe('DashboardDialogs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('mounts no dialog at rest, only the progress modal with the runner controls', () => {
        const given = props();
        render(<DashboardDialogs {...given} />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mockProgressModal).toHaveBeenCalledWith({
            operation: RESET_OPERATION,
            onRetry: given.operations.retry,
            onClose: given.operations.close,
        });
    });

    describe('change source', () => {
        it('opens the Add a demo package dialog in change mode, with no catalog and no remembered demos', () => {
            render(<DashboardDialogs {...props({ changeSourceDemo: DEMO })} />);

            expect(screen.getByRole('dialog', { name: 'Change source' })).toBeInTheDocument();
            const handed = mockAddDemoModal.mock.calls[0][0];
            expect(handed).toMatchObject({
                isOpen: true,
                mode: 'change',
                currentKind: 'eds',
                demoPackageName: 'Isle5',
            });
            expect(handed.packages).toStrictEqual([]);
            expect(handed.addedDemos).toStrictEqual([]);
            expect(handed.onUseShipped()).toBeUndefined();
        });

        it('re-requests status after the source changes, and nothing else', () => {
            render(<DashboardDialogs {...props({ changeSourceDemo: DEMO })} />);

            fireEvent.click(screen.getByRole('button', { name: 'Use this demo' }));

            expect(mockPostMessage.mock.calls).toStrictEqual([['requestStatus']]);
        });

        it('closes through the screen', () => {
            const given = props({ changeSourceDemo: DEMO });
            render(<DashboardDialogs {...given} />);

            fireEvent.click(screen.getByRole('button', { name: 'Close source' }));

            expect(given.onCloseChangeSource).toHaveBeenCalledTimes(1);
        });
    });

    describe('hand-over dialogs', () => {
        it('opens Export with the project kind and its own close', () => {
            const given = props({ isEds: true, handover: handover({ exportOpen: true }) });
            render(<DashboardDialogs {...given} />);

            expect(screen.getByRole('dialog', { name: 'Export' })).toBeInTheDocument();
            expect(mockExportModal).toHaveBeenCalledWith({
                isOpen: true,
                isEds: true,
                onClose: given.handover.closeExport,
            });
            expect(screen.queryByRole('dialog', { name: 'Save as demo package' })).not.toBeInTheDocument();
        });

        it('opens Save as demo package with its own close', () => {
            const given = props({ handover: handover({ demoPackageOpen: true }) });
            render(<DashboardDialogs {...given} />);

            expect(mockDemoPackageModal).toHaveBeenCalledWith({
                isOpen: true,
                onClose: given.handover.closeDemoPackage,
            });
            expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument();
        });
    });

    describe('AI capabilities', () => {
        it('hands the catalog every inventory field, with no progress shown as undefined', () => {
            const given = props({ capabilitiesOpen: true });
            render(<DashboardDialogs {...given} />);

            expect(mockCapabilitiesModal).toHaveBeenCalledWith({
                skills: given.ai.aiSkills,
                mcps: given.ai.aiMcps,
                hasSkillsError: true,
                hasMcpsError: false,
                editedFiles: ['AGENTS.md'],
                gatedSkills: given.ai.aiGatedSkills,
                isLoading: false,
                onClose: given.onCloseCapabilities,
                onRegenerate: given.ai.regenerateAiFiles,
                isBusy: true,
                progress: undefined,
                errorMessage: 'Tooling install failed',
            });
        });

        it('passes live regenerate progress through', () => {
            const progress = { currentOperation: 'Writing skills', progress: 40 };
            render(<DashboardDialogs {...props({ capabilitiesOpen: true, ai: ai({ aiRegenProgress: progress }) })} />);

            expect(mockCapabilitiesModal.mock.calls[0][0].progress).toBe(progress);
        });

        it('closes on dismiss and on its own close, and regenerates on request', () => {
            const given = props({ capabilitiesOpen: true });
            render(<DashboardDialogs {...given} />);

            fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
            fireEvent.click(screen.getByRole('button', { name: 'Close capabilities' }));
            fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

            expect(given.onCloseCapabilities).toHaveBeenCalledTimes(2);
            expect(given.ai.regenerateAiFiles).toHaveBeenCalledTimes(1);
        });
    });
});
