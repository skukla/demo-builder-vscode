/**
 * Configure's ACO on/off (PL-60): held until Save, sent only when it differs from the project's,
 * and the screen reads the project as if it held the choice so ACO's fields appear at once.
 */

import { act, renderHook } from '@testing-library/react';
import { useAcoAddonSwitch } from '@/features/dashboard/ui/configure/hooks/useAcoAddonSwitch';
import { createMockProject } from '../../../../../helpers/projectFake';

const off = createMockProject({ selectedAddons: [] });
const on = createMockProject({ selectedAddons: ['adobe-commerce-aco'] });

describe('useAcoAddonSwitch', () => {
    it('offers nothing where ACO is not offered and the project does not have it', () => {
        const { result } = renderHook(() => useAcoAddonSwitch(off, 'not-offered'));
        expect(result.current.choice).toBeUndefined();
        expect(result.current.acoAddon).toBeUndefined();
    });

    it('keeps the way to turn ACO off for a project that has it, even where it is no longer offered', () => {
        const { result } = renderHook(() => useAcoAddonSwitch(on, 'not-offered'));
        expect(result.current.choice).toMatchObject({ offer: 'optional', isOn: true });
    });

    it('holds a tick until Save: the view gains ACO, the save will send it, and a note says what saving does', () => {
        const { result } = renderHook(() => useAcoAddonSwitch(off, 'optional'));
        act(() => result.current.choice?.onChange(true));
        expect(result.current.viewProject.selectedAddons).toEqual(['adobe-commerce-aco']);
        expect(result.current.acoAddon).toBe(true);
        expect(result.current.choice?.note).toMatch(/Saving sets up its credential/u);
    });

    it('sends nothing once saved, or when ticked back to what the project holds', () => {
        const { result } = renderHook(() => useAcoAddonSwitch(off, 'optional'));
        act(() => result.current.choice?.onChange(true));
        act(() => result.current.markAcoSaved());
        expect(result.current.acoAddon).toBeUndefined();
        expect(result.current.choice?.note).toBeUndefined();
        act(() => result.current.choice?.onChange(false));
        expect(result.current.acoAddon).toBe(false);
        expect(result.current.choice?.note).toMatch(/remove any ACO datapack first/u);
    });
});
