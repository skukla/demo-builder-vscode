/**
 * Integration Card Model (integrations-grid Step 2)
 *
 * The ONE pure derivation behind the dashboard integrations card grid +
 * detail drawer: `deriveIntegrationCard` (keyed integration entries),
 * `deriveMeshCard` (the mesh peer card), and `buildIntegrationCards` (list
 * assembly + pending-card synthesis for unknown-id `deploying` overrides).
 * Card face, drawer body, and drawer action bar all consume the same
 * `IntegrationCardModel` — the mesh/integration asymmetry lives ONLY here.
 *
 * React-free and webview-safe: the only cross-feature imports are the pure
 * bundled-JSON catalog lookups (same precedent as AppBuilderComponentRow).
 *
 * Deliberate prototype deviation (plan YAGNI): the DEPLOYED mesh card has NO
 * "Open ↗" face — the GraphQL endpoint answers POSTs, not a browser GET; the
 * endpoint renders mono in the drawer instead.
 *
 * @module features/dashboard/ui/components/integrations/integrationCardModel
 */

import type { StatusDisplay, MeshStatus } from '../../hooks/useDashboardStatus';
import type { StatusDotVariant } from '@/core/ui/components/ui/StatusDot';
import type { IdentifiedAppBuilderComponent } from '@/features/app-builder/services/appBuilderComponentState';
import {
    getAppBuilderComponentEntry,
    isBlankSource,
} from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';

/** Card status vocabulary: the integration union plus the mesh-only states. */
export type CardStatus =
    | 'not-deployed'
    | 'deploying'
    | 'deployed'
    | 'stale'
    | 'error'
    | 'needs-auth'
    | 'checking';

/** Action identifiers dispatched by the grid's single handleAction switch. */
export type CardAction =
    | 'deploy'
    | 'redeploy'
    | 'update'
    | 'retry'
    | 'manage-apis'
    | 'remove'
    | 'sign-in'
    | 'open';

/** The attention verbs a card face may surface (everything except Open↗). */
type AttentionKind = 'deploy' | 'update' | 'retry' | 'sign-in';

/**
 * The card face's at-most-one affordance — an ATTENTION verb only (Deploy /
 * Update / Retry / Sign in). `disabled` is set only by the mesh producer (its
 * actions gate on in-flight operations).
 *
 * Open↗ deliberately does NOT live here. It is an ordinary action on a healthy
 * integration, and it sat in the attention slot only because the slot existed —
 * so it moved to the kebab, where ProjectCard has always kept "Open in Browser"
 * (that card has no face affordance at all). The payoff is that a healthy card
 * now carries NO button, so any card showing one is a card that needs you.
 */
export type FaceAction = { kind: AttentionKind; disabled?: boolean };


/**
 * Live per-card status override pushed via `appBuilderComponentStatusUpdate`
 * (merged id-keyed by the useRowStatusOverrides hook; shape identical to the
 * hook's internal type — this export is its one durable home).
 */
export interface RowStatusOverride {
    status: string;
    message?: string;
    /** Update-borne display name (rename pushes it; deploy pushes omit it). */
    name?: string;
}

/** Everything a card face, drawer body, and drawer action bar render. */
export interface IntegrationCardModel {
    id: string;
    isMesh: boolean;
    name: string;
    kindLabel: string;
    /**
     * `owner/repo` — an identifier you can go look up, which is why the card
     * typesets it in mono.
     *
     * Absent on the mesh, which has no source repo. The hardcoded prose that
     * used to fill the slot ('GraphQL bridge · Adobe I/O') was a constant wearing
     * the identifier styling: it never varied by project or state, so it carried
     * no information, and the same string had already been cut from the detail
     * panel as decoration. Optional rather than a placeholder — a card with
     * nothing to say here renders no line at all.
     */
    sourceLine?: string;
    sourceIsAi: boolean;
    status: CardStatus;
    statusLabel: string;
    dotVariant: StatusDotVariant;
    message?: string;
    url?: string;
    urlLabel: 'Endpoint' | 'App URL';
    deployedUrls?: Record<string, string>;
    apis?: string[];
    /** Preformatted locale display string (already display-ready). */
    lastDeployed?: string;
    faceAction?: FaceAction;
    /**
     * The card's own kebab menu. Kept OFF the face so the at-most-one-affordance
     * rule survives: the face carries the urgent verb (Deploy / Update / Retry),
     * the menu carries the deliberate ones. Empty on the mesh (nothing about it
     * is editable) and while deploying.
     */
    menuActions: CardAction[];
    /**
     * The keyed `appBuilderComponents` id to act on, when it differs from `id`.
     *
     * Only the mesh sets it. The mesh card's `id` is the literal `'mesh'` — a
     * stable grid identity that exists before any mesh is deployed — while the
     * component it removes is keyed by its real id (`eds-accs-mesh`). Removal
     * must address the latter; everything else addresses `id`.
     */
    componentId?: string;
    canRename: boolean;
}

type IntegrationStatus = 'not-deployed' | 'deploying' | 'deployed' | 'stale' | 'error';

/** statusLabel + dot per integration status (the prototype's STATUS map). */
const INTEGRATION_STATUS_DISPLAY: Record<
    IntegrationStatus,
    { label: string; dot: StatusDotVariant }
> = {
    'not-deployed': { label: 'Not deployed', dot: 'neutral' },
    deploying: { label: 'Deploying…', dot: 'info' },
    deployed: { label: 'Deployed', dot: 'success' },
    stale: { label: 'Update available', dot: 'warning' },
    error: { label: 'Deploy failed', dot: 'error' },
};


/**
 * The integration face matrix: the at-most-one ATTENTION verb per status.
 *
 * There is no bar half any more. Each status used to carry a drawer button row
 * (the verb + Manage APIs + Remove) which was the kebab's items wearing a
 * different control, in a third place — so the flyout now renders this same face
 * verb plus the same kebab the card uses. Deployed has no verb on purpose: a
 * healthy card is calm, so any card showing a button is a card that needs you.
 */
const INTEGRATION_ACTIONS: Record<IntegrationStatus, { face?: FaceAction }> = {
    'not-deployed': { face: { kind: 'deploy' } },
    deploying: {},
    deployed: {},
    stale: { face: { kind: 'update' } },
    error: { face: { kind: 'retry' } },
};

/**
 * The card's kebab items.
 *
 * Open leads when the integration has a URL — it is the most common thing to do
 * with a healthy one, just not urgent enough for the card face. Nothing is
 * offered mid-deploy: every item would race the runner.
 *
 * Rename is deliberately absent — it is the name's own inline pencil, matching
 * ProjectCard.
 *
 * @param status - the card's normalized status
 * @param url - the integration's primary URL, when it has one
 * @returns the menu actions, in display order
 */
function buildMenuActions(status: IntegrationStatus, url: string | undefined): CardAction[] {
    if (status === 'deploying') return [];
    // Redeploy is a DELIBERATE action on a card that is already working, so it
    // belongs in the menu rather than on the face (a face button means the card
    // needs you). A stale card's urgent verb is Update, on the face — redeploying
    // it anyway is the deliberate variant, so the menu carries that too.
    const redeploy: CardAction[] = status === 'deployed' ? ['redeploy'] : [];
    return [
        ...(url ? (['open'] as CardAction[]) : []),
        ...redeploy,
        'manage-apis',
        'remove',
    ];
}

/**
 * Narrow a live status string (override channel carries 'deploying' beyond
 * the persisted union) to the integration matrix; unknown values fall back to
 * the not-deployed treatment so a bad push can never blank the grid.
 */
function normalizeIntegrationStatus(status: string): IntegrationStatus {
    return status in INTEGRATION_STATUS_DISPLAY ? (status as IntegrationStatus) : 'not-deployed';
}

/** Mono `owner/repo`, or an em-dash for empty legacy sources. */
function formatSourceLine(source: { owner: string; repo: string }): string {
    return source.owner && source.repo ? `${source.owner}/${source.repo}` : '—';
}

/** ISO date → locale display string; absent/unparseable → undefined. */
function formatLastDeployed(iso: string | undefined): string | undefined {
    if (!iso) return undefined;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
}

/** The card's primary URL: the entry url, else the first deployedUrls value. */
function resolvePrimaryUrl(entry: IdentifiedAppBuilderComponent): string | undefined {
    return entry.url ?? Object.values(entry.deployedUrls ?? {})[0];
}

/**
 * kindLabel / source-line / apis facet. Catalog id → 'Pre-built' (+ its
 * requiredApis); a blank-entry source → 'Custom · built with AI' (the shell
 * instancing path); anything else → 'Imported repo' with a mono owner/repo.
 */
function deriveKindFacet(entry: IdentifiedAppBuilderComponent): {
    kindLabel: string;
    sourceLine: string;
    sourceIsAi: boolean;
    apis?: string[];
    isCatalog: boolean;
} {
    const catalogEntry = getAppBuilderComponentEntry(entry.id);
    if (catalogEntry) {
        return {
            kindLabel: 'Pre-built',
            sourceLine: formatSourceLine(entry.source),
            sourceIsAi: false,
            apis: catalogEntry.requiredApis,
            isCatalog: true,
        };
    }
    if (isBlankSource(entry.source)) {
        return {
            // NOT "built with AI": the blank starter is an EMPTY shell you build
            // out yourself (with AI, in-project, later). Labelling a freshly-added
            // shell as already AI-built described the intended workflow as though
            // it had happened (reported 2026-07-31).
            kindLabel: 'Custom · blank starter',
            sourceLine: 'Blank starter — build it out',
            sourceIsAi: true,
            isCatalog: false,
        };
    }
    return {
        kindLabel: 'Imported repo',
        sourceLine: formatSourceLine(entry.source),
        sourceIsAi: false,
        isCatalog: false,
    };
}

/**
 * What the DRAWER's message row shows, beneath the status label.
 *
 * A live deploy step is already the label (the card face renders only that), and
 * the drawer prints label AND message — so returning it here too would print the
 * same step twice in the flyout. What remains for this slot is the failure reason
 * persisted with an error, which survives a reload and is the only thing that can
 * answer "why?" once the live push is gone.
 *
 * @param status - the card's normalized status
 * @param liveStep - the in-flight step already promoted to the label, if any
 * @param override - the live per-row push
 * @param entry - the persisted component
 * @returns the message row's text, or undefined to omit the row
 */
function resolveCardMessage(
    status: CardStatus,
    liveStep: string | undefined,
    override: RowStatusOverride | undefined,
    entry: IdentifiedAppBuilderComponent,
): string | undefined {
    if (liveStep) {
        return undefined;
    }
    if (override?.message) {
        return override.message;
    }
    return status === 'error' ? entry.error : undefined;
}

/**
 * Derive an integration entry's card model, applying its live override
 * (status/name/message win over the persisted entry; a name-less override
 * keeps the persisted name — the hook's merge already preserved rename labels).
 */
export function deriveIntegrationCard(
    entry: IdentifiedAppBuilderComponent,
    override?: RowStatusOverride,
): IntegrationCardModel {
    const status = normalizeIntegrationStatus(override?.status ?? entry.status);
    const facet = deriveKindFacet(entry);
    const primaryUrl = resolvePrimaryUrl(entry);
    const { label: staticLabel, dot: dotVariant } = INTEGRATION_STATUS_DISPLAY[status];
    const actions = INTEGRATION_ACTIONS[status];

    // While deploying, the live step IS the label — because the card FACE renders
    // `statusLabel` and nothing else (IntegrationCard.tsx). Putting the step on
    // `message` alone left the face stuck on a constant "Deploying…" and sent the
    // detail to a drawer that is closed during a deploy. The mesh card has always
    // worked this way (its statusLabel is the live status text); this makes the
    // two kinds agree.
    //
    // Only while DEPLOYING. A failure reason is a full CLI sentence and would
    // blow out an 11px uppercase card face, so an error keeps the terse label and
    // leaves its reason for the drawer.
    const liveStep = status === 'deploying' ? override?.message : undefined;
    const statusLabel = liveStep ?? staticLabel;


    return {
        id: entry.id,
        isMesh: false,
        name: override?.name ?? entry.name ?? entry.id,
        kindLabel: facet.kindLabel,
        sourceLine: facet.sourceLine,
        sourceIsAi: facet.sourceIsAi,
        status,
        statusLabel,
        dotVariant,
        message: resolveCardMessage(status, liveStep, override, entry),
        url: primaryUrl,
        urlLabel: 'App URL',
        deployedUrls: entry.deployedUrls,
        apis: facet.apis,
        lastDeployed: formatLastDeployed(entry.lastDeployed),
        faceAction: actions.face ? { ...actions.face } : undefined,
        menuActions: buildMenuActions(status, primaryUrl),
        canRename: entry.kind === 'integration' && !facet.isCatalog,
    };
}

/** Collapse a raw MeshStatus onto the card vocabulary (config drift = stale). */
export function toMeshCardStatus(status: MeshStatus | undefined): CardStatus {
    switch (status) {
        case 'config-changed':
        case 'config-incomplete':
        case 'update-declined':
            return 'stale';
        case undefined:
            return 'checking';
        default:
            return status;
    }
}

/**
 * The mesh matrix: dot + the at-most-one face verb per card status. No Manage
 * APIs and no Remove anywhere (the mesh's lifecycle is owned by the project
 * configuration); the deployed card has NO Open↗ face (see module doc).
 *
 * Deployed carries no face verb — redeploying a healthy mesh is deliberate, so
 * it is the one thing in the mesh's kebab (see deriveMeshCard).
 */
const MESH_MATRIX: Record<CardStatus, { dot: StatusDotVariant; face?: AttentionKind }> = {
    checking: { dot: 'neutral' },
    'needs-auth': { dot: 'warning', face: 'sign-in' },
    'not-deployed': { dot: 'neutral', face: 'deploy' },
    deploying: { dot: 'info' },
    deployed: { dot: 'success' },
    stale: { dot: 'warning', face: 'update' },
    error: { dot: 'error', face: 'retry' },
};

/**
 * The mesh card's kebab items.
 *
 * Redeploy on a healthy idle mesh, unchanged from the baseline: whether a face
 * button or a kebab item is the right home for the OTHER states is a question
 * about every tile, not the mesh alone, and is not settled here.
 *
 * Remove requires a real keyed component id: `removeAppBuilderComponent` looks the
 * entry up by id, so offering the verb without one would open a confirm dialog in
 * front of a guaranteed "not found". A project whose mesh was never deployed has
 * no entry and therefore no Remove.
 *
 * @param cardStatus - the mesh card's normalized status
 * @param isActionDisabled - a mesh/demo operation is in flight
 * @param componentId - the keyed appBuilderComponents id, when the mesh exists
 * @returns the menu actions, in display order
 */
function meshMenuActions(
    cardStatus: CardStatus,
    isActionDisabled: boolean,
    componentId: string | undefined,
): CardAction[] {
    if (isActionDisabled) return [];
    const redeploy: CardAction[] = cardStatus === 'deployed' ? ['redeploy'] : [];
    const remove: CardAction[] = componentId ? ['remove'] : [];
    return [...redeploy, ...remove];
}

/**
 * Derive the mesh peer card. The status label is ALWAYS the live
 * `statusDisplay.text` (the retired badge's vocabulary, unchanged), and every
 * action carries `disabled: isActionDisabled` (mesh/demo operation in flight).
 */
export function deriveMeshCard(
    statusDisplay: StatusDisplay,
    status: MeshStatus | undefined,
    meshEntry: AppBuilderComponentState | undefined,
    isActionDisabled: boolean,
    meshComponentId?: string,
): IntegrationCardModel {
    const cardStatus = toMeshCardStatus(status);
    const row = MESH_MATRIX[cardStatus];

    return {
        id: 'mesh',
        isMesh: true,
        name: 'API Mesh',
        kindLabel: 'API Mesh',
        sourceIsAi: false,
        status: cardStatus,
        statusLabel: statusDisplay.text,
        dotVariant: row.dot,
        // The label is the live status text; the REASON comes off the persisted
        // entry, so an errored mesh can still explain itself after a reload.
        message: cardStatus === 'error' ? meshEntry?.error : undefined,
        url: meshEntry?.endpoint,
        urlLabel: 'Endpoint',
        lastDeployed: formatLastDeployed(meshEntry?.lastDeployed),
        faceAction: row.face ? { kind: row.face, disabled: isActionDisabled } : undefined,
        // The mesh has no display name to change (canRename false) and no API
        // access of its own, so the menu holds only the two verbs that apply:
        // Redeploy on a healthy idle mesh, and Remove whenever a mesh component
        // actually exists to tear down. Both are deliberate actions, which is why
        // they live here rather than on the face. Withheld while an op is in
        // flight: an action you cannot take is not offered.
        menuActions: meshMenuActions(cardStatus, isActionDisabled, meshComponentId),
        componentId: meshComponentId,
        canRename: false,
    };
}

/**
 * Synthesize the card for a just-added component the seeded map doesn't know
 * yet: an unknown-id 'deploying' override (the add flow pushes 'deploying'
 * before the entry is persisted). Name/source resolve from the catalog when
 * the id is a catalog add; a custom-URL add renders its id with a '—' source
 * line. Never renamable mid-add.
 */
function synthesizePendingCard(
    id: string,
    override: RowStatusOverride,
    catalog?: AppBuilderComponentCatalogEntry[],
): IntegrationCardModel {
    const entry = catalog?.find((e) => e.id === id) ?? getAppBuilderComponentEntry(id);
    const synthetic: IdentifiedAppBuilderComponent = {
        id,
        kind: 'integration',
        status: 'not-deployed',
        name: entry?.name,
        source: entry?.source ?? { owner: '', repo: '' },
    };
    return { ...deriveIntegrationCard(synthetic, override), canRename: false };
}

/**
 * Assemble the grid's integration cards: one per `kind:'integration'` entry
 * (each with its OWN override), plus a synthesized pending card per
 * unknown-id 'deploying' override. Terminal-status orphan overrides are
 * ignored — a removed card must not resurrect from its last push.
 */
export function buildIntegrationCards(
    components: IdentifiedAppBuilderComponent[],
    overrides: Record<string, RowStatusOverride>,
    catalog?: AppBuilderComponentCatalogEntry[],
): IntegrationCardModel[] {
    const integrations = components.filter((component) => component.kind === 'integration');
    const cards = integrations.map((component) =>
        deriveIntegrationCard(component, overrides[component.id]),
    );

    const knownIds = new Set(integrations.map((component) => component.id));
    for (const [id, override] of Object.entries(overrides)) {
        if (!knownIds.has(id) && override.status === 'deploying') {
            cards.push(synthesizePendingCard(id, override, catalog));
        }
    }

    return cards;
}
