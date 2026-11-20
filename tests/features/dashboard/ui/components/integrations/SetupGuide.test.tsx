/**
 * SetupGuide — the setup guide's flow with no integration behind it (PL-101): a title, the
 * steps, and where its requests go, all handed in. The integration's `SetupGuideModal` is one
 * caller; a project's leftover steps are the next. The stubs are the SetupGuideModal family's.
 */

import { mockRequest } from '../../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { APPLY_COPY } from './SetupGuideModal.testUtils';
import { SetupGuide } from '@/features/dashboard/ui/components/integrations/SetupGuide';
import { footerButtons } from '@/features/dashboard/ui/components/integrations/setupGuideFooter';
import type { SetupRequestTarget } from '@/features/dashboard/ui/components/integrations/useSetupChecklist';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

const step = (overrides: Partial<SetupChecklistItem>): SetupChecklistItem => ({
    id: 'root-category',
    title: 'Set the Root Category',
    why: 'The store shows the datapack only under its own root category.',
    where: 'Stores > All Stores',
    state: 'open',
    checkable: false,
    ...overrides,
});

/** A project's steps, sent to handlers that are not an integration's. */
const PROJECT_TARGET: SetupRequestTarget = {
    messages: {
        setStep: 'setProjectStep',
        check: 'checkProjectSteps',
        prepare: 'prepareProjectChecks',
    },
    payload: { scope: 'project' },
};

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { ready: true } });
});

async function renderGuide(items: SetupChecklistItem[]) {
    render(
        <SetupGuide
            title="Finish Setup: Scratch"
            items={items}
            target={PROJECT_TARGET}
            onOpenAdmin={jest.fn().mockResolvedValue(undefined)}
            onClose={jest.fn()}
        />
    );
    await act(async () => {});
}

describe('SetupGuide with no integration', () => {
    it('shows the title it is given and every step it is given', async () => {
        await renderGuide([step({}), step({ id: 'republish', title: 'Republish the Code' })]);
        expect(screen.getByRole('dialog', { name: 'Finish Setup: Scratch' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Set the Root Category/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Republish the Code/ })).toBeInTheDocument();
    });

    it('sends Mark as Done to the target it is given, with the target payload', async () => {
        await renderGuide([step({})]);
        fireEvent.click(screen.getByRole('button', { name: 'Mark as Done' }));
        await act(async () => {});
        expect(mockRequest).toHaveBeenCalledWith('setProjectStep', {
            scope: 'project',
            stepId: 'root-category',
            state: 'done',
        });
        expect(mockRequest.mock.calls.some(([type]) => type === 'setSetupStep')).toBe(false);
    });

    it('checks never-checked steps and signs in through the target it is given', async () => {
        await renderGuide([step({ checkable: true, checkState: 'unchecked' })]);
        expect(mockRequest).toHaveBeenCalledWith('prepareProjectChecks', { scope: 'project' });
        expect(mockRequest).toHaveBeenCalledWith('checkProjectSteps', {
            scope: 'project',
            stepId: 'root-category',
        });
    });
});

describe('Apply follows what the step says it can do', () => {
    it('offers Apply for a step marked applicable that declares no integration setup', () => {
        const item = step({ checkable: true, applicable: true });
        const buttons = footerButtons({
            item,
            busy: false,
            setDone: jest.fn(),
            openAdmin: jest.fn(),
            fix: jest.fn(),
        });
        expect(buttons.map((button) => button.label)).toContain(APPLY_COPY.apply);
    });

    it('offers no Apply for a step that declares a setup but is not marked applicable', () => {
        const item = step({
            checkable: true,
            setup: { kind: 'handler', handler: 'create-erp-attributes' },
        });
        const buttons = footerButtons({
            item,
            busy: false,
            setDone: jest.fn(),
            openAdmin: jest.fn(),
            fix: jest.fn(),
        });
        expect(buttons.map((button) => button.label)).not.toContain(APPLY_COPY.apply);
    });
});
