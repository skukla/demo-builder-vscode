/**
 * The ACO add-on's choice in the Commerce → Catalog step (PL-60, owner 2026-10-31 P1): off by
 * default, offered only where the stack offers ACO and the demo package allows it (`addonOffer`),
 * and recorded through the selection hub (`useProjectBuilder.onAddonsChange`). The credential is
 * set up when the project is created (`executeAcoCredentialPhase`), so the SC types none.
 *
 * Split out of `CommerceStep` to keep the step under its size limit; it has no other caller.
 *
 * @module features/project-creation/ui/steps/useAcoAddonChoice
 */

import React, { useCallback, useMemo } from 'react';
import { ACO_ADDON_ID } from '@/features/components/services/acoSettings';
import { addonOffer } from '@/features/components/services/addonOffer';
import { AcoAddonChoice } from '@/features/components/ui/components/AcoAddonChoice';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';

const NO_ADDONS: readonly string[] = [];

/** What ticking ACO in the wizard leads to (P2): the SC types no credential. */
const ACO_CREATION_NOTE = 'Demo Builder sets up its credential in your Adobe workspace when it creates the project';

/**
 * @param selectedAddons - the wizard's chosen add-ons
 * @param stack - the stack the Commerce settings are driven from
 * @param pkg - the chosen demo package
 * @param onAddonsChange - the selection hub's add-on handler
 * @returns the choice to render above the Catalog form (renders nothing where ACO is not offered)
 */
export function useAcoAddonChoice(
    selectedAddons: readonly string[] | undefined,
    stack: Stack | undefined,
    pkg: DemoPackage | undefined,
    onAddonsChange: (addons: string[]) => void,
): React.ReactNode {
    const offer = useMemo(() => addonOffer(ACO_ADDON_ID, stack, pkg), [stack, pkg]);
    const addons = selectedAddons ?? NO_ADDONS;
    const isOn = addons.includes(ACO_ADDON_ID);
    const handleChange = useCallback(
        (on: boolean) => {
            const others = addons.filter((id) => id !== ACO_ADDON_ID);
            onAddonsChange(on ? [...others, ACO_ADDON_ID] : others);
        },
        [addons, onAddonsChange],
    );
    return useMemo(
        () => <AcoAddonChoice offer={offer} isOn={isOn} onChange={handleChange} note={isOn ? ACO_CREATION_NOTE : undefined} />,
        [offer, isOn, handleChange],
    );
}
