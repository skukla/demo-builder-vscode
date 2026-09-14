/**
 * An added demo's card carries a menu with one action, Remove; a shipped
 * brand's card carries none, and neither does an added card when no handler
 * is given.
 */

import { Provider, defaultTheme } from '@adobe/react-spectrum';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrandGallery } from '@/features/project-creation/ui/components/BrandGallery';
import { packageFromAddedDemo } from '@/features/components/services/storefrontResolver';
import { PACKAGES, STACKS, cardFor } from './BrandGallery.testUtils';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';

const JEN = makeAddedDemo();
const JEN_CARD = packageFromAddedDemo(JEN, undefined);

function renderWithMenu(onForgetDemo?: (id: string) => void) {
    return render(
        <Provider theme={defaultTheme} colorScheme="light">
            <BrandGallery
                packages={[...PACKAGES, JEN_CARD]}
                stacks={STACKS}
                onPackageSelect={jest.fn()}
                onForgetDemo={onForgetDemo}
            />
        </Provider>,
    );
}

describe('BrandGallery — forgetting an added demo', () => {
    it("puts a menu on the added demo's card only, and only when a handler is given", () => {
        const first = renderWithMenu(undefined);
        expect(screen.queryByLabelText('More actions for Isle5 by Jen')).not.toBeInTheDocument();
        first.unmount();

        renderWithMenu(jest.fn());
        expect(within(cardFor('Isle5 by Jen')).getByLabelText('More actions for Isle5 by Jen')).toBeInTheDocument();
        expect(within(cardFor('Active Brand')).queryByLabelText(/More actions/)).not.toBeInTheDocument();
    });

    it('offers Remove, which reports the card\'s package id without selecting the card', () => {
        const onForgetDemo = jest.fn();
        const onPackageSelect = jest.fn();
        render(
            <Provider theme={defaultTheme} colorScheme="light">
                <BrandGallery
                    packages={[...PACKAGES, JEN_CARD]}
                    stacks={STACKS}
                    onPackageSelect={onPackageSelect}
                    onForgetDemo={onForgetDemo}
                />
            </Provider>,
        );

        screen.getByLabelText('More actions for Isle5 by Jen').click();
        const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
        expect(items).toEqual(['Remove']);
        screen.getByRole('menuitem', { name: 'Remove' }).click();

        expect(onForgetDemo).toHaveBeenCalledWith(JEN_CARD.id);
        expect(onPackageSelect).not.toHaveBeenCalled();
    });
});
