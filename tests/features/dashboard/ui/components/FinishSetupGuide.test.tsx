/**
 * The project dashboard's Finish Setup (PL-101): the plain "N steps remaining" line with Finish
 * Setup, and the guide it opens, titled "Finish Setup: <project>", whose requests go to the
 * project's Finish Setup handlers. Apply on Republish the Code runs the dashboard's own Republish.
 *
 * Real: Spectrum, the setup guide, its hook. Faked: the webview channel (the canonical double).
 */

import { mockRequest } from '../../../../helpers/webviewClientMock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { FinishSetupGuide } from '@/features/dashboard/ui/components/FinishSetupGuide';
import { FinishSetupLine } from '@/features/dashboard/ui/components/FinishSetupLine';
import { useFinishSetup } from '@/features/dashboard/ui/hooks/useFinishSetup';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';
import type { FinishSetupStatus } from '@/types/webviewPayloads';

const CODE: SetupChecklistItem = {
    id: 'republish-code',
    title: 'Republish the Code',
    why: 'The live site does not serve scripts/a.js as the repository has it yet.',
    where: 'Project Dashboard > Republish',
    state: 'open',
    checkable: true,
    applicable: true,
    checkState: 'failed',
};

const status = (remaining: number, items: SetupChecklistItem[] = [CODE]): FinishSetupStatus => ({
    items,
    remaining,
});

beforeEach(() => {
    mockRequest.mockReset();
    mockRequest.mockResolvedValue({ success: true, data: { items: [CODE] } });
});

describe('FinishSetupLine', () => {
    it.each([
        [2, '2 steps remaining'],
        [1, '1 step remaining'],
    ])('says %i left as "%s", with Finish Setup opening the guide', (remaining, line) => {
        const onOpen = jest.fn();
        render(<FinishSetupLine status={status(remaining)} onOpen={onOpen} />);

        expect(screen.getByText(line)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Finish Setup'));
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it('shows nothing when every step is done or skipped, or no run left any', () => {
        const { container, rerender } = render(<FinishSetupLine status={status(0)} onOpen={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();

        rerender(<FinishSetupLine status={undefined} onOpen={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});

/** The dashboard's wiring of the two, as the screen and its dialogs hold them. */
function Host({
    steps,
    openOnArrival,
    republish,
}: {
    steps?: FinishSetupStatus;
    openOnArrival?: boolean;
    republish?: () => void;
}): React.ReactElement {
    const finishSetup = useFinishSetup(steps, openOnArrival, republish);
    return (
        <>
            <FinishSetupLine status={steps} onOpen={finishSetup.open} />
            <FinishSetupGuide controls={finishSetup} projectName="Scratch" />
        </>
    );
}

async function settle(): Promise<void> {
    await act(async () => {});
}

describe('FinishSetupGuide', () => {
    it('opens from the line, titled for the project, asking the Finish Setup handlers', async () => {
        render(<Host steps={status(1, [{ ...CODE, checkState: 'unchecked' }])} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Finish Setup'));
        await settle();

        expect(screen.getByRole('heading', { name: 'Finish Setup: Scratch' })).toBeInTheDocument();
        expect(mockRequest).toHaveBeenCalledWith('prepareFinishSetupChecks', {});
        expect(mockRequest).toHaveBeenCalledWith('checkFinishSetupSteps', { stepId: 'republish-code' });
    });

    it('opens by itself when the dashboard was opened for it, once the steps arrive', async () => {
        const { rerender } = render(<Host openOnArrival />);
        await settle();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        rerender(<Host openOnArrival steps={status(1)} />);
        await settle();

        expect(screen.getByRole('heading', { name: 'Finish Setup: Scratch' })).toBeInTheDocument();
    });

    it('runs Republish for Apply This Step on Republish the Code, closing the guide for its window', async () => {
        const republish = jest.fn();
        render(<Host steps={status(1)} openOnArrival republish={republish} />);
        await settle();

        fireEvent.click(screen.getByRole('button', { name: 'Apply This Step' }));
        await settle();

        expect(republish).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('offers no Apply when the dashboard has no Republish to run', async () => {
        render(<Host steps={status(1)} openOnArrival />);
        await settle();

        expect(screen.queryByRole('button', { name: 'Apply This Step' })).not.toBeInTheDocument();
    });
});
