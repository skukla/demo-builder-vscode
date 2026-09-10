import { screen } from '@testing-library/react';
import { renderContent } from './SelectionStepContent.testUtils';
import '@testing-library/jest-dom';

describe('SelectionStepContent - disabled items', () => {
    it('renders all items when no disabledIds are provided (back-compat)', () => {
        renderContent({});
        expect(screen.getByText('Selectable Org')).toBeInTheDocument();
        expect(screen.getByText('Filtered Org')).toBeInTheDocument();
    });

    it('renders the disabled reason next to a non-selectable item', () => {
        renderContent({
            disabledIds: ['o2'],
            disabledReasons: { o2: 'Sign in with a different account.' },
        });
        expect(screen.getByText('Sign in with a different account.')).toBeInTheDocument();
    });

    it('does not render a reason for items that are not disabled', () => {
        renderContent({
            disabledIds: ['o2'],
            disabledReasons: { o2: 'Sign in with a different account.' },
        });
        // The selectable org has no reason text under it.
        expect(screen.queryByText('Selectable Org')).toBeInTheDocument();
        expect(screen.queryAllByText('Sign in with a different account.')).toHaveLength(1);
    });
});
