/**
 * WelcomeStep on Import from File with a demo bundle (EDS-72 decision 2): the step shows only
 * the demo being imported, chosen and fixed, under the project name. No packages grid, no filter,
 * no Add a Demo Package card, and a click changes nothing. Without a bundle the grid is as it was.
 */

import { fireEvent, screen } from '@testing-library/react';
import type { ImportedFrom } from '@/types/projectFile';
import { PACKAGES, STACKS, renderWelcome } from './WelcomeStep.testUtils';
import '@testing-library/jest-dom';

const IMPORTED: ImportedFrom = {
    bundleName: 'Bodea Summit',
    bundlePath: '/Users/sc/Downloads/bodea-demo-bundle.zip',
    sourceRepository: 'sender/kukla-bodea',
};

describe('WelcomeStep — an imported demo bundle', () => {
    it('shows the imported demo alone, chosen, named from the bundle, with the project name above it', () => {
        renderWelcome({
            packages: PACKAGES,
            stacks: STACKS,
            state: {
                wizardMode: 'import',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                importedFrom: IMPORTED,
            },
        });

        const cards = screen.getAllByTestId('package-card');
        expect(cards).toHaveLength(1);
        expect(cards[0]).toHaveTextContent('Bodea Summit');
        expect(cards[0]).toHaveTextContent('Imported from bodea-demo-bundle.zip');
        expect(screen.queryByText('CitiSignal')).not.toBeInTheDocument();
        expect(screen.queryByTestId('add-demo-card')).not.toBeInTheDocument();
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        expect(document.querySelector('input[type="text"]')).not.toBeNull();
    });

    it('stays fixed: clicking the card changes no selection, and Continue opens on a valid name', () => {
        const { updateState, setCanProceed } = renderWelcome({
            packages: PACKAGES,
            stacks: STACKS,
            state: {
                wizardMode: 'import',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
                importedFrom: IMPORTED,
            },
        });

        fireEvent.click(screen.getByTestId('package-card'));

        const selections = updateState.mock.calls.filter(([update]) => 'selectedPackage' in update);
        expect(selections).toHaveLength(0);
        expect(setCanProceed).toHaveBeenLastCalledWith(true);
    });

    it('CONTROL: without a bundle the grid shows every package', () => {
        renderWelcome({
            packages: PACKAGES,
            stacks: STACKS,
            state: {
                wizardMode: 'import',
                selectedPackage: 'citisignal',
                selectedStack: 'eds-paas',
            },
        });

        expect(screen.getAllByTestId('package-card')).toHaveLength(2);
    });
});
