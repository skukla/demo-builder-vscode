/**
 * The ACO add-on's on/off on the Configure screen (PL-60 P1: Configure carries the toggle, since
 * Edit hides the wizard's Catalog step).
 *
 * The choice is held here until Save, like every value on this screen: Save sends `acoAddon` only
 * when it differs from what the project holds, and the extension then sets up or removes the
 * credential before keeping the change (`applyAcoAddonChange`). Meanwhile the screen reads a
 * project whose `selectedAddons` follows the choice, so ACO's fields appear as soon as it is
 * ticked.
 *
 * @module features/dashboard/ui/configure/hooks/useAcoAddonSwitch
 */

import { useCallback, useMemo, useState } from 'react';
import { ACO_ADDON_ID } from '@/features/components/services/acoSettings';
import type { AcoAddonChoiceProps } from '@/features/components/ui/components/AcoAddonChoice';
import type { Project } from '@/types/base';
import type { AddonOffer } from '@/types/stacks';

/** Said under the choice while a change waits for Save. */
const PENDING_ON = 'Saving sets up its credential in the project’s Adobe workspace';
const PENDING_OFF = 'Saving removes its credential; remove any ACO datapack first';

export interface UseAcoAddonSwitchReturn {
    /** The project as the screen should read it: `selectedAddons` follows the choice. */
    viewProject: Project;
    /** The choice's props, or undefined where the project may not have ACO at all. */
    choice?: AcoAddonChoiceProps;
    /** What to send with Save: the new value when it differs from the project's, else undefined. */
    acoAddon?: boolean;
    /** After a save, the project holds the choice. */
    markAcoSaved: () => void;
}

/**
 * @param project - the project as loaded
 * @param offer - what its stack and package allow (`projectAcoOffer`, from the extension)
 */
export function useAcoAddonSwitch(project: Project, offer: AddonOffer | undefined): UseAcoAddonSwitchReturn {
    const initiallyOn = (project.selectedAddons ?? []).includes(ACO_ADDON_ID);
    const [saved, setSaved] = useState(initiallyOn);
    const [isOn, setIsOn] = useState(initiallyOn);

    const viewProject = useMemo(() => {
        if (isOn === initiallyOn) return project;
        const others = (project.selectedAddons ?? []).filter((id) => id !== ACO_ADDON_ID);
        return { ...project, selectedAddons: isOn ? [...others, ACO_ADDON_ID] : others };
    }, [project, isOn, initiallyOn]);

    // A project that has ACO keeps the way to turn it off, even if its package no longer offers it.
    const effectiveOffer: AddonOffer = offer === 'not-offered' && saved ? 'optional' : (offer ?? 'not-offered');
    const pendingNote = isOn ? PENDING_ON : PENDING_OFF;
    const choice = useMemo<AcoAddonChoiceProps | undefined>(
        () =>
            effectiveOffer === 'not-offered'
                ? undefined
                : { offer: effectiveOffer, isOn, onChange: setIsOn, note: isOn !== saved ? pendingNote : undefined },
        [effectiveOffer, isOn, saved, pendingNote],
    );
    const markAcoSaved = useCallback(() => setSaved(isOn), [isOn]);

    return { viewProject, choice, acoAddon: isOn !== saved ? isOn : undefined, markAcoSaved };
}
