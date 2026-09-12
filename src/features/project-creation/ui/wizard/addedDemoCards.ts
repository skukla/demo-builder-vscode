/**
 * The grid's cards for the remembered demos: every remembered demo as a card
 * of its own (decided 2026-09-11), then, in edit mode, the project's own demo
 * when the setting no longer lists it. A removed setting prunes the card and
 * never a project's own row: the project carries its row (D2).
 *
 * Pure, so the container's list is testable without mounting the wizard.
 *
 * @module features/project-creation/ui/wizard/addedDemoCards
 */

import { addedDemoId, packageFromAddedDemo } from '@/features/components/services/storefrontResolver';
import type { DemoPackage } from '@/types/demoPackages';
import type { AddedDemo } from '@/types/projectFile';

/**
 * @param addedDemos - The remembered demos (from settings, plus the dialog's optimistic adds)
 * @param own - The project's own row, in edit mode
 * @param selectedStack - The project's stack, so the own row's card carries a storefront for it
 * @returns The cards, remembered first, the project's own last when it is not remembered
 */
export function addedDemoCards(
    addedDemos: readonly AddedDemo[],
    own: AddedDemo | undefined,
    selectedStack: string | undefined,
): DemoPackage[] {
    const cards = addedDemos.map((demo) => packageFromAddedDemo(demo, undefined));
    if (own && !addedDemos.some((demo) => addedDemoId(demo) === addedDemoId(own))) {
        cards.push(packageFromAddedDemo(own, selectedStack));
    }
    return cards;
}

/** The remembered list with one row added or, for the same repository, replaced in place. */
export function withAddedDemo(list: readonly AddedDemo[], demo: AddedDemo): AddedDemo[] {
    const key = addedDemoId(demo);
    const index = list.findIndex((row) => addedDemoId(row) === key);
    return index >= 0 ? list.map((row, i) => (i === index ? demo : row)) : [...list, demo];
}
