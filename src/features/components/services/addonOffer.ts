/**
 * Whether a project may have an add-on, and whether it must (PL-60, owner 2026-10-31 P1: ACO is
 * offered only where the demo package allows it).
 *
 * Two catalogs decide it: the stack offers the add-on (`stacks.json` `optionalAddons`), and the
 * demo package may require or exclude it (`demo-packages.json` `addons`, whose schema documents
 * the blacklist model: an add-on a package does not list is allowed). The wizard's Catalog step
 * and Configure both ask here, so the two never offer different things.
 *
 * Pure and `vscode`-free: the webviews import it.
 *
 * @module features/components/services/addonOffer
 */

import type { DemoPackage } from '@/types/demoPackages';
import type { AddonOffer, Stack } from '@/types/stacks';

/**
 * @param addonId - the add-on's id (`components.json` `addons`)
 * @param stack - the project's stack, or undefined when none is chosen
 * @param pkg - the project's demo package, or undefined when it has none
 */
export function addonOffer(
    addonId: string,
    stack: Pick<Stack, 'optionalAddons'> | undefined,
    pkg: Pick<DemoPackage, 'addons'> | undefined,
): AddonOffer {
    if (!(stack?.optionalAddons ?? []).some((addon) => addon.id === addonId)) return 'not-offered';
    const rule = pkg?.addons?.[addonId];
    if (rule === 'excluded') return 'not-offered';
    return rule === 'required' ? 'required' : 'optional';
}
