/**
 * StoreStructureSelector Component Tests
 *
 * The selector forwards an isDisabled flag to the Spectrum Picker so the store
 * selection fields can render in a disabled "detecting" state before data lands
 * (eliminating the store-discovery layout shift). When disabled it must still
 * occupy its footprint even with no items yet; when enabled with no items it
 * renders nothing (legacy behavior preserved).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { StoreStructureSelector } from '@/features/components/ui/components/StoreStructureSelector';

const items = [
    { code: 'base', name: 'Base', numericId: 1 },
    { code: 'alt', name: 'Alt', numericId: 2 },
];

describe('StoreStructureSelector', () => {
    it('offers every item as a choice', () => {
        render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={jest.fn()}
            />
        );
        const options = Array.from(
            screen.getByTestId('spectrum-picker-select').querySelectorAll('option')
        );
        expect(options.map((o) => o.textContent)).toStrictEqual(['Base', 'Alt']);
    });

    it('shows the selected item, and shows nothing when the selection is empty', () => {
        // The picker is a CONTROLLED field: its selected key comes from
        // selectedCode, and '' has to arrive as "no selection" rather than as a
        // key nothing matches, or a fresh field would look pre-filled.
        const { rerender } = render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode="alt"
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByTestId('spectrum-picker')).toHaveTextContent('Alt');

        rerender(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByTestId('spectrum-picker')).toHaveTextContent('');
    });

    it('reports the chosen item CODE, not its name, to onSelect', () => {
        const onSelect = jest.fn();
        render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={onSelect}
            />
        );

        fireEvent.change(screen.getByTestId('spectrum-picker-select'), {
            target: { value: 'alt' },
        });

        // The code is what the cascading store lookups key off.
        expect(onSelect).toHaveBeenCalledWith('alt');
    });

    it('renders a picker with items', () => {
        render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={jest.fn()}
            />
        );
        expect(screen.getByTestId('spectrum-picker')).toBeInTheDocument();
    });

    it('renders the picker (footprint) while disabled even with no items yet', () => {
        render(
            <StoreStructureSelector
                label="Website"
                items={[]}
                selectedCode=""
                onSelect={jest.fn()}
                isDisabled
            />
        );
        // Disabled + empty must still occupy space so the layout does not shift.
        expect(screen.getByTestId('spectrum-picker')).toBeInTheDocument();
    });

    it('renders nothing when enabled with no items (legacy behavior)', () => {
        const { container } = render(
            <StoreStructureSelector
                label="Website"
                items={[]}
                selectedCode=""
                onSelect={jest.fn()}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('forwards the disabled state to the picker', () => {
        render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={jest.fn()}
                isDisabled
            />
        );
        expect(screen.getByTestId('spectrum-picker')).toBeDisabled();
    });
});
