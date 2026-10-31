/**
 * The ACO add-on in the wizard's Commerce → Catalog step (PL-60 P1): off by default, shown only
 * where the stack offers ACO and the package allows it, and ticking it records the add-on through
 * the selection hub (`useProjectBuilder.onAddonsChange`). Its fields then join the Catalog form,
 * which reads the chosen add-ons (`selectedAddons`).
 */

import './CommerceStep.testUtils';
import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import { PACKAGES, PAAS, STACKS, setup, stepTab } from './commerceStepTestHarness';

jest.mock('@/features/project-creation/ui/components/ConnectStoreStepContent', () => ({
    ConnectStoreStepContent: (props: { section?: string; selectedAddons?: readonly string[] }) => (
        <div data-testid="connect-store-panel" data-section={props.section ?? ''} data-addons={(props.selectedAddons ?? []).join(',')} />
    ),
}));

const ACO = 'adobe-commerce-aco';
const withAco = (stacks: Stack[]): Stack[] => stacks.map((s) => (s.id === 'eds-paas' ? { ...s, optionalAddons: [{ id: ACO }] } : s));
const allowing = (rule: 'optional' | 'excluded'): DemoPackage[] =>
    PACKAGES.map((p) => (p.id === 'buildright' ? { ...p, addons: { [ACO]: rule } } : p));

const AT_CATALOG = {
    selectedPackage: 'buildright',
    selectedBackend: PAAS,
    selectedStack: 'eds-paas',
    commerceConnectValid: true,
    commerceStoreViewChosen: true,
};

describe('CommerceStep — ACO in the Catalog step', () => {
    it('offers ACO unticked where the package allows it, and records it when ticked', () => {
        const { updateState } = setup(AT_CATALOG, { packages: allowing('optional'), stacks: withAco(STACKS) });
        fireEvent.click(stepTab('catalog'));
        const box = screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ });
        expect(box).not.toBeChecked();
        fireEvent.click(box);
        expect(updateState).toHaveBeenCalledWith({ selectedAddons: [ACO] });
        expect(screen.getByTestId('connect-store-panel')).toHaveAttribute('data-addons', ACO);
    });

    it('does not offer ACO where the package excludes it', () => {
        setup(AT_CATALOG, { packages: allowing('excluded'), stacks: withAco(STACKS) });
        fireEvent.click(stepTab('catalog'));
        expect(screen.queryByTestId('aco-addon-choice')).not.toBeInTheDocument();
    });

    it('does not offer ACO where the stack does not', () => {
        setup(AT_CATALOG, { packages: allowing('optional'), stacks: STACKS });
        fireEvent.click(stepTab('catalog'));
        expect(screen.queryByTestId('aco-addon-choice')).not.toBeInTheDocument();
    });

    it('shows it only in the Catalog step', () => {
        setup(AT_CATALOG, { packages: allowing('optional'), stacks: withAco(STACKS) });
        fireEvent.click(stepTab('business-structure'));
        expect(screen.queryByTestId('aco-addon-choice')).not.toBeInTheDocument();
    });
});
