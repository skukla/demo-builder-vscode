/**
 * WelcomeStep with added demos: their cards select like a brand and carry the
 * row (D2); a shipped brand clears it; the plus card opens the dialog.
 */

import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { addedDemoId, packageFromAddedDemo } from '@/features/components/services/storefrontResolver';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { PACKAGES, STACKS, renderWelcome } from './WelcomeStep.testUtils';

jest.mock('@/core/ui/utils/vscode-api', () => ({
    webviewClient: { request: jest.fn() },
}));

import { webviewClient } from '@/core/ui/utils/vscode-api';
import { act } from '@testing-library/react';

const JEN = makeAddedDemo({ configDefaults: { ACCS_WEBSITE_CODE: 'isle5' } });
const JEN_CARD = packageFromAddedDemo(JEN, undefined);

describe('WelcomeStep — added demos', () => {
    it("selecting an added demo's card records its id and its row, with its own defaults", () => {
        const { updateState } = renderWelcome({ packages: [...PACKAGES, JEN_CARD], stacks: STACKS, addedDemos: [JEN] });

        fireEvent.click(screen.getByRole('button', { name: /^Isle5 by Jen:/ }));

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedPackage: addedDemoId(JEN),
                demo: JEN,
                packageConfigDefaults: { ACCS_WEBSITE_CODE: 'isle5' },
                selectedStack: undefined,
            }),
        );
    });

    it('selecting a shipped brand afterwards clears the row', () => {
        const { updateState } = renderWelcome({
            packages: [...PACKAGES, JEN_CARD],
            stacks: STACKS,
            addedDemos: [JEN],
            state: { selectedPackage: addedDemoId(JEN), demo: JEN },
        });

        fireEvent.click(screen.getByRole('button', { name: /^CitiSignal:/ }));

        expect(updateState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedPackage: 'citisignal', demo: undefined }),
        );
    });

    it('opens the Add a demo dialog from the plus card', () => {
        renderWelcome({ packages: PACKAGES, stacks: STACKS });
        expect(screen.queryByRole('heading', { name: 'Add a demo' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('add-demo-card'));

        expect(screen.getByRole('heading', { name: 'Add a demo' })).toBeInTheDocument();
    });
});

describe('WelcomeStep — forgetting an added demo', () => {
    const request = webviewClient.request as jest.Mock;

    beforeEach(() => {
        request.mockReset();
    });

    it('asks the host to forget the demo by name and source', async () => {
        request.mockResolvedValue({ success: true, result: { forgotten: true } });
        renderWelcome({ packages: [...PACKAGES, JEN_CARD], stacks: STACKS, addedDemos: [JEN] });

        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });

        expect(request).toHaveBeenCalledWith('forget-added-demo', {
            name: 'Isle5 by Jen',
            source: { owner: 'jen', repo: 'isle5-demo' },
        });
    });

    it('deselects a forgotten demo that was the selection, row included; leaves a cancelled one alone', async () => {
        request.mockResolvedValueOnce({ success: true, result: { forgotten: false } });
        const { updateState } = renderWelcome({
            packages: [...PACKAGES, JEN_CARD],
            stacks: STACKS,
            addedDemos: [JEN],
            state: { selectedPackage: addedDemoId(JEN), demo: JEN },
        });
        updateState.mockClear();

        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });
        expect(updateState).not.toHaveBeenCalled();

        request.mockResolvedValueOnce({ success: true, result: { forgotten: true } });
        await act(async () => {
            screen.getByLabelText('More actions for Isle5 by Jen').click();
        });
        await act(async () => {
            screen.getByRole('menuitem', { name: 'Remove' }).click();
        });
        expect(updateState).toHaveBeenCalledWith({ selectedPackage: undefined, demo: undefined });
    });
});
