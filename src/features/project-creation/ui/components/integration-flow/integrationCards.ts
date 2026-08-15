/**
 * integrationCards — PURE producer: wizard result rows → shared card models.
 *
 * The wizard's counterpart to the dashboard's `integrationCardModel.ts`. Both
 * feed the same `IntegrationCard` (`core/ui/components/integrations`); they
 * differ entirely in what they can KNOW. The dashboard reads deployed state. The
 * wizard runs before anything is built, so a card here carries identity, origin,
 * the APIs it will provision, and nothing else.
 *
 * That is why the card takes a `subline`: the dashboard fills the card's one
 * quiet line with deploy status, and the wizard has none to give. A "Not
 * deployed" label on every card would be chrome that never varies. {@link
 * sublineFor} builds what goes there instead.
 *
 * No React and no wizard state — rows in, models out. Row resolution itself is
 * {@link resolveIntegrationRows}.
 *
 * @module features/project-creation/ui/components/integration-flow/integrationCards
 */

import type { IntegrationRow } from './integrationRows';
import type { CardAction, IntegrationCardModel } from '@/core/ui/components/integrations';

/**
 * Whether a row carries editable free API picks (custom/blank, not mesh/catalog).
 *
 * The rule the retired center-column row enforced, kept to one home. A mesh's and
 * a catalog entry's APIs are deterministic, so offering Manage APIs on them opens
 * a picker that can change nothing.
 *
 * Exported because it answers TWO questions that must never disagree: which cards
 * get a Manage APIs verb, and which cards are pressable at all (the picker is the
 * wizard's only card detail). The host asks this directly rather than inferring
 * openability from `menuActions`, which would read one rule's output to answer
 * the other and drift the moment {@link menuActionsFor} changed.
 */
export function isApiEditable(kind: IntegrationRow['kind']): boolean {
    return kind === 'blank' || kind === 'custom';
}

/**
 * The card's kebab items.
 *
 * Remove is universal — every row can be dropped from the build. Nothing else
 * applies before a deploy: there is no Deploy verb (the wizard's Continue builds
 * everything at once), no Open (no URL exists), and no Retry (nothing has run).
 *
 * @param kind - the row's integration kind
 * @returns the menu actions, in display order
 */
function menuActionsFor(kind: IntegrationRow['kind']): CardAction[] {
    return isApiEditable(kind) ? ['manage-apis', 'remove'] : ['remove'];
}

/**
 * Display label per kind, matching the dashboard's vocabulary for the same
 * things. `IntegrationCardModel.kindLabel` is documented as a LABEL, and the raw
 * enum ('blank', 'catalog') was satisfying the type while breaking the contract —
 * invisible today because no wizard surface renders it, and a trap for the first
 * one that does.
 */
const KIND_LABELS: Record<IntegrationRow['kind'], string> = {
    mesh: 'API Mesh',
    catalog: 'Pre-built',
    // Word-for-word the dashboard's label, including its deliberate refusal to
    // say "built with AI": a blank starter is an EMPTY shell you build out
    // later, and calling a freshly-added one AI-built describes the intended
    // workflow as though it had happened (reported 2026-07-31, fixed there).
    // `Record<IntegrationRow['kind'], …>` makes a new kind a compile error here.
    blank: 'Custom · blank starter',
    custom: 'Imported repo',
};

/**
 * Turn resolved wizard rows into shared card models, order preserved.
 *
 * @param rows - the wizard's result rows (`resolveIntegrationRows`)
 * @returns one card model per row, in the same order
 */
export function toIntegrationCards(rows: IntegrationRow[]): IntegrationCardModel[] {
    return rows.map((row) => ({
        id: row.id,
        isMesh: row.kind === 'mesh',
        name: row.name,
        kindLabel: KIND_LABELS[row.kind],
        sourceLine: row.sourceLine,
        sourceIsAi: row.kind === 'blank',
        // Shape-satisfying, never rendered by THIS surface: the wizard passes
        // `subline` to the card, which takes the status line's place entirely,
        // and it has no detail view to show a url in. `kindLabel` above is a real
        // label rather than a placeholder — a wrong-but-plausible value is worse
        // than an obviously absent one if a detail view ever lands here.
        status: 'not-deployed',
        statusLabel: '',
        dotVariant: 'neutral',
        urlLabel: 'App URL',
        apis: row.apis,
        menuActions: menuActionsFor(row.kind),
        canRename: row.renamable === true,
    }));
}

/**
 * The card's one quiet line: where the integration came from, and how many APIs
 * it will provision.
 *
 * The count replaces the old row's collapsible "APIs in use · N" list. The count
 * is the part worth keeping on the face — it is the only pre-build signal that an
 * integration provisions anything. The NAMES are one click away behind the
 * kebab's Manage APIs, which opens the picker that lists them.
 *
 * Each segment is dropped when it has nothing to say, so the line never reads
 * "· 0 APIs" or opens with a stray separator.
 *
 * @param card - a card model from {@link toIntegrationCards}
 * @returns the subline text
 */
export function sublineFor(card: IntegrationCardModel): string {
    const count = card.apis?.length ?? 0;
    const segments = [
        card.sourceLine,
        count > 0 ? `${count} ${count === 1 ? 'API' : 'APIs'}` : undefined,
    ];
    return segments.filter(Boolean).join(' · ');
}
