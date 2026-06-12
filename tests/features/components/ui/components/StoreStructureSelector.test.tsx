/**
 * StoreStructureSelector Component Tests
 *
 * The selector forwards an isDisabled flag to the Spectrum Picker so the store
 * selection fields can render in a disabled "detecting" state before data lands
 * (eliminating the store-discovery layout shift). When disabled it must still
 * occupy its footprint even with no items yet; when enabled with no items it
 * renders nothing (legacy behavior preserved).
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';
import { StoreStructureSelector } from '@/features/components/ui/components/StoreStructureSelector';

const items = [
    { code: 'base', name: 'Base', numericId: 1 },
    { code: 'alt', name: 'Alt', numericId: 2 },
];

describe('StoreStructureSelector', () => {
    it('renders a picker with items', () => {
        render(
            <StoreStructureSelector
                label="Website"
                items={items}
                selectedCode=""
                onSelect={jest.fn()}
            />,
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
            />,
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
            />,
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
            />,
        );
        expect(screen.getByTestId('spectrum-picker')).toBeDisabled();
    });
});
