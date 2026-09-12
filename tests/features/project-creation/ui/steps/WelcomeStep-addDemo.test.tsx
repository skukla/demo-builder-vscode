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
