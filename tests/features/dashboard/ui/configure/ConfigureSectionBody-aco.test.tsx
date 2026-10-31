/**
 * The ACO tab (PL-60): the on/off first, then ACO's fields once it is on. Real Spectrum renders
 * the checkbox here (as in `CheckboxRow.test.tsx`), so no Spectrum mock is needed.
 */

import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { field, renderSectionBody, sectionOf } from './ConfigureSectionBody.testUtils';
import type { ServiceGroup } from '@/features/dashboard/ui/configure/configureTypes';

const ACO_GROUP: ServiceGroup = { id: 'adobe-commerce-aco', label: 'Adobe Commerce Optimizer', fields: [field('ACO_TENANT_ID')] };
const ACO_SECTION = sectionOf('aco', 'adobe-commerce-aco', 'Adobe Commerce Optimizer');

describe('ConfigureSectionBody — the ACO tab', () => {
    it('shows only the choice while ACO is off', () => {
        renderSectionBody({ section: ACO_SECTION, serviceGroups: [], acoChoice: { offer: 'optional', isOn: false, onChange: jest.fn() } });
        expect(screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ })).not.toBeChecked();
        expect(screen.queryByTestId('row-ACO_TENANT_ID')).not.toBeInTheDocument();
    });

    it('shows the choice and then ACO\'s fields once it is on', () => {
        renderSectionBody({ section: ACO_SECTION, serviceGroups: [ACO_GROUP], acoChoice: { offer: 'optional', isOn: true, onChange: jest.fn() } });
        expect(screen.getByRole('checkbox', { name: /Adobe Commerce Optimizer/ })).toBeChecked();
        expect(screen.getByTestId('row-ACO_TENANT_ID')).toBeInTheDocument();
    });
});
