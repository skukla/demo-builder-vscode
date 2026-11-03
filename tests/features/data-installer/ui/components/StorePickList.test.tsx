/**
 * Filtering Clear Demo Data's store tree: a store that matches keeps its website above it, and a
 * website that matches keeps all its stores, because ticking a website ticks every one of them.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StorePickList } from '@/features/data-installer/ui/components/StorePickList';
import type { WipeChoiceWebsite } from '@/types/demoDataWipe';

const CHOICES: WipeChoiceWebsite[] = [
    {
        code: 'alpha_site',
        name: 'Alpha Website',
        stores: [
            { code: 'alpha_us', name: 'Alpha US', views: [], ticked: false },
            { code: 'alpha_fr', name: 'Alpha FR', views: [], ticked: false },
        ],
    },
    { code: 'beta_site', name: 'Beta Website', stores: [{ code: 'beta_us', name: 'Beta Main', views: [], ticked: false }] },
];

const box = (name: RegExp) => screen.queryByRole('checkbox', { name });

function filterBy(query: string) {
    render(<StorePickList choices={CHOICES} ticks={new Set()} onChange={jest.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
}

describe('StorePickList filter', () => {
    it('shows a store that matches, under its website, without its siblings', () => {
        filterBy('fr');

        expect(box(/Alpha Website/)).toBeInTheDocument();
        expect(box(/Alpha FR/)).toBeInTheDocument();
        expect(box(/Alpha US/)).not.toBeInTheDocument();
        expect(box(/Beta/)).not.toBeInTheDocument();
    });

    it('shows every store of a website that matches', () => {
        filterBy('alpha website');

        expect(box(/Alpha US/)).toBeInTheDocument();
        expect(box(/Alpha FR/)).toBeInTheDocument();
    });

    it('matches on a code as well as a name', () => {
        filterBy('beta_us');

        expect(box(/Beta Main/)).toBeInTheDocument();
    });

    it('says so when nothing matches', () => {
        filterBy('nothing');

        expect(screen.getByText(/No stores match/)).toBeInTheDocument();
    });

    it('CONTROL: shows everything with no filter', () => {
        render(<StorePickList choices={CHOICES} ticks={new Set()} onChange={jest.fn()} />);

        expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    });
});
