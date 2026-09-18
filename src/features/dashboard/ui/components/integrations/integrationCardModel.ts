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
 * The asymmetry is which DERIVATION runs, not what the states are called: the
 * status vocabulary itself moved to `@/core/ui/utils/statusVocabulary`, which
 * every surface now shares. This file used to hold a second table, and the mesh
 * card took its label from one and its dot from another.
 *
 * React-free and webview-safe: the only cross-feature imports are the pure
 * bundled-JSON catalog lookups (the established webview-safe import precedent —
 * a comparison here used to name AppBuilderComponentRow, deleted long since).
 *
 * Deliberate prototype deviation (plan YAGNI): the DEPLOYED mesh card has NO
 * "Open ↗" face — the GraphQL endpoint answers POSTs, not a browser GET; the
 * endpoint renders mono in the drawer instead.
 *
 * @module features/dashboard/ui/components/integrations/integrationCardModel
 */

import type { StatusDisplay, MeshStatus } from '../../hooks/useDashboardStatus';
import {
    ACCS_WEBSITE_CODE,
    ACCS_STORE_CODE,
    ACCS_STORE_VIEW_CODE,
    PAAS_WEBSITE_CODE,
    PAAS_STORE_CODE,
    PAAS_STORE_VIEW_CODE,
} from '@/core/config/envVarKeys';
import type { IdentifiedAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import type {
    CardAction,
    CardStatus,
    CommerceScopePart,
    IntegrationCardModel,
    LinkedCard,
} from '@/core/ui/components/integrations/integrationCardModel.types';
import { getStatusDisplay, severityToDot } from '@/core/ui/utils/statusVocabulary';
import {
    getAppBuilderComponentCatalog,
    getAppBuilderComponentEntry,
    isBlankSource,
} from '@/features/components/services/appBuilderComponentCatalogLoader';
import { systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState } from '@/types/base';
import type { CommerceStoreStructure } from '@/types/commerceStore';

/**
 * The card's shape and vocabulary now live in `core/ui` so the wizard can
 * render the same card without importing this feature. Re-exported here under
 * the names every dashboard consumer already uses — there is no second
 * vocabulary behind the alias.
 *
 * What stays: every DERIVATION below. It reads `useDashboardStatus` and
 * `@/features/app-builder/*` — live-project concerns with no meaning before a
 * project is built.
 */
export type {
    CardAction,
    CardStatus,
    CommerceScopePart,
    IntegrationCardModel,
    LinkedCard,
} from '@/core/ui/components/integrations/integrationCardModel.types';

/**
 * The verb a status is ASKING for, or undefined when the card is idle.
 *
 * It is a kebab item like every other verb — cards carry no face button. Spectrum
 * deprecated that pattern ("Don't use quick actions") precisely because a button on
 * a card that is itself clickable presents conflicting nested actions, and ours
 * needed a stopPropagation wrapper to survive its own container's click. Both card
 * kinds resolve through here, so neither can drift from the other.
 * See `.rptc/research/card-face-buttons-vs-kebab/research.md`.
 *
 * A failed card with newer code recorded asks for Update, not Retry: Update fetches
 * the new code and redeploys, so it does Retry's job too, and offering Retry alone
 * hid the update on the card that needed it (owner, 2026-09-18: "Deploy failed" on
 * one tile and "Update" only on the other).
 */
function statusVerb(status: CardStatus, hasUpdate = false): CardAction | undefined {
    if (status === 'not-deployed') return 'deploy';
    if (status === 'stale' || status === 'config-incomplete') return 'update';
    if (status === 'error') return hasUpdate ? 'update' : 'retry';
    if (status === 'needs-auth') return 'sign-in';
    return undefined;
}

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

type IntegrationStatus = 'not-deployed' | 'deploying' | 'deployed' | 'stale' | 'error';

/**
 * The subset of the shared vocabulary an INTEGRATION can be in. The mesh-only
 * states (config-incomplete / needs-auth / checking) are absent by design, so a
 * live push carrying one lands on the not-deployed treatment rather than
 * rendering a mesh state on an integration card.
 */
const INTEGRATION_STATUSES: readonly string[] = [
    'not-deployed',
    'deploying',
    'deployed',
    'stale',
    'error',
];

/**
 * The integration card's kebab items.
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
 * @param installation - the Commerce install record, when the app has one
 * @returns the menu actions, in display order
 */
function buildMenuActions(
    status: IntegrationStatus,
    url: string | undefined,
    installation: IntegrationCardModel['installation'],
    hasUpdate = false,
): CardAction[] {
    if (status === 'deploying') return [];
    // The status verb leads: on a card that needs something, that something is the
    // first thing in the menu. Redeploy only where there is a deployment to redo —
    // 'deploy'/'retry'/'update' already cover the other states, and offering both
    // would put two names for one intent in one menu.
    const verb = statusVerb(status, hasUpdate);
    const redeploy: CardAction[] = status === 'deployed' ? ['redeploy'] : [];
    // A deployed app whose Commerce install failed is dormant, and until AB-5
    // the ONLY retry was a full redeploy round. The install verb leads for the
    // same reason the status verb does: it is what the card needs. A refused
    // upgrade needs the reinstall instead, and only then is it offered: it
    // removes what the app set up in Commerce.
    const install: CardAction[] =
        status === 'deployed' && installation?.failed ? [installation.needsReinstall ? 'reinstall' : 'install'] : [];
    return [
        ...(verb ? [verb] : []),
        ...install,
        ...(url ? (['open'] as CardAction[]) : []),
        ...redeploy,
        'manage-apis',
        'remove',
    ];
}

/**
 * A system card's kebab items: its screen, its reset (only while it and the
 * integration that runs the reset are both deployed), its redeploy, its removal
 * (which takes its integration too). No Manage APIs: a system's APIs are part
 * of the project's set, not its own choice.
 */
function buildSystemMenuActions(
    status: IntegrationStatus,
    url: string | undefined,
    usedBy: LinkedCard | undefined,
    hasUpdate = false,
): CardAction[] {
    if (status === 'deploying' || usedBy?.status === 'deploying') return [];
    const verb = statusVerb(status, hasUpdate);
    const resettable = status === 'deployed' && usedBy?.status === 'deployed';
    return [
        ...(verb ? [verb] : []),
        ...(url ? (['open'] as CardAction[]) : []),
        ...(resettable ? (['reset-records'] as CardAction[]) : []),
        ...(status === 'deployed' ? (['redeploy'] as CardAction[]) : []),
        'remove',
    ];
}

/**
 * A deployed component with newer code recorded (`updateAvailable`, from the
 * integrations screen's check) reads as needing an update. Shared with the
 * dashboard's Integrations tile so the dot and the card agree.
 *
 * @param status - the live or persisted status
 * @param entry - the persisted component
 * @returns 'stale' for a deployed component with an update, else `status`
 */
export function withUpdateStatus(status: string, entry: Pick<IdentifiedAppBuilderComponent, 'updateAvailable'>): string {
    return status === 'deployed' && entry.updateAvailable ? 'stale' : status;
}

/** A card as the cards linked to it name it. */
function toLinkedCard(model: IntegrationCardModel): LinkedCard {
    return {
        id: model.id,
        name: model.name,
        status: model.status,
        statusLabel: model.statusLabel,
        dotVariant: model.dotVariant,
    };
}

/** What every card face shows for a component: status, label, dot and message. */
function deriveFace(
    entry: IdentifiedAppBuilderComponent,
    override: RowStatusOverride | undefined,
): { status: IntegrationStatus; statusLabel: string; dotVariant: IntegrationCardModel['dotVariant']; message?: string } {
    const status = normalizeIntegrationStatus(withUpdateStatus(override?.status ?? entry.status, entry));
    const shared = getStatusDisplay(status);
    // While deploying, the live step IS the label — because the card FACE renders
    // `statusLabel` and nothing else (IntegrationCard.tsx). Putting the step on
    // `message` alone left the face stuck on a constant "Deploying…" and sent the
    // detail to a drawer that is closed during a deploy. The mesh card does the
    // same for its transient states, so the two kinds agree — and since 2026-08-04
    // they agree on the SETTLED states by construction too, both reading their
    // label and severity from the one shared table.
    //
    // Only while DEPLOYING. A failure reason is a full CLI sentence and would
    // blow out an 11px uppercase card face, so an error keeps the terse label and
    // leaves its reason for the drawer.
    const liveStep = status === 'deploying' ? override?.message : undefined;
    return {
        status,
        statusLabel: liveStep ?? shared?.label ?? '',
        dotVariant: severityToDot(shared?.severity ?? 'neutral'),
        message: resolveCardMessage(status, liveStep, override, entry),
    };
}

/**
 * Narrow a live status string (override channel carries 'deploying' beyond
 * the persisted union) to the integration matrix; unknown values fall back to
 * the not-deployed treatment so a bad push can never blank the grid.
 */
function normalizeIntegrationStatus(status: string): IntegrationStatus {
    return INTEGRATION_STATUSES.includes(status) ? (status as IntegrationStatus) : 'not-deployed';
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
 * The persisted App Management install record, display-ready. 'skipped' means
 * the app's installer found everything already current and 'upgraded' that it
 * moved to the deployed version — both ARE installed, and rendering either as
 * anything else would read as a problem.
 */
function installationLabel(record: NonNullable<IdentifiedAppBuilderComponent['installation']>): string {
    if (record.needsReinstall) return 'Needs reinstall';
    return record.status === 'failed' ? 'Not installed' : 'Installed';
}

function deriveInstallation(
    entry: IdentifiedAppBuilderComponent,
): IntegrationCardModel['installation'] {
    const record = entry.installation;
    if (!record) return undefined;
    const failed = record.status === 'failed';
    return {
        label: installationLabel(record),
        detail: record.detail,
        at: formatLastDeployed(record.at),
        failed,
        ...(record.needsReinstall ? { needsReinstall: true } : {}),
    };
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
    if (status === 'stale' && entry.updateAvailable) {
        return 'A newer version is available. Update fetches it and deploys it.';
    }
    return status === 'error' ? entry.error : undefined;
}

/**
 * Derive an integration entry's card model, applying its live override
 * (status/name/message win over the persisted entry; a name-less override
 * keeps the persisted name — the hook's merge already preserved rename labels).
 *
 * @param entry - the persisted integration
 * @param override - its live row push
 * @param systems - the system cards it uses, for its "Uses" row
 * @returns the card model
 */
export function deriveIntegrationCard(
    entry: IdentifiedAppBuilderComponent,
    override?: RowStatusOverride,
    systems: LinkedCard[] = [],
): IntegrationCardModel {
    const face = deriveFace(entry, override);
    const facet = deriveKindFacet(entry);
    const primaryUrl = resolvePrimaryUrl(entry);
    const installation = deriveInstallation(entry);

    return withRemovalStopped(entry, {
        id: entry.id,
        isMesh: false,
        name: override?.name ?? entry.name ?? entry.id,
        kindLabel: facet.kindLabel,
        sourceLine: facet.sourceLine,
        sourceIsAi: facet.sourceIsAi,
        ...face,
        url: primaryUrl,
        urlLabel: 'App URL',
        deployedUrls: entry.deployedUrls,
        apis: facet.apis,
        lastDeployed: formatLastDeployed(entry.lastDeployed),
        installation,
        menuActions: buildMenuActions(face.status, primaryUrl, installation, Boolean(entry.updateAvailable)),
        canRename: entry.kind === 'integration' && !facet.isCatalog,
        ...(systems.length > 0 ? { linked: { label: 'Uses' as const, cards: systems } } : {}),
    });
}

/**
 * Derive a system's card (the ERP an integration uses): its own status, its
 * type as a badge, its screen as the URL, and the integration it belongs to.
 *
 * @param entry - the persisted system
 * @param override - its live row push
 * @param usedBy - the integration card it belongs to, when that is in the project
 * @param catalog - where its type is declared
 * @returns the card model
 */
export function deriveSystemCard(
    entry: IdentifiedAppBuilderComponent,
    override?: RowStatusOverride,
    usedBy?: LinkedCard,
    catalog?: readonly AppBuilderComponentCatalogEntry[],
): IntegrationCardModel {
    const face = deriveFace(entry, override);
    const catalogEntry = catalog?.find((e) => e.id === entry.id) ?? getAppBuilderComponentEntry(entry.id);
    const type = catalogEntry?.systemType ?? 'System';
    const screenUrl = resolvePrimaryUrl(entry);

    return withRemovalStopped(entry, {
        id: entry.id,
        isMesh: false,
        isSystem: true,
        typeBadge: type,
        name: override?.name ?? entry.name ?? entry.id,
        kindLabel: type,
        sourceLine: formatSourceLine(entry.source),
        sourceIsAi: false,
        ...face,
        url: screenUrl,
        urlLabel: 'Screen',
        deployedUrls: entry.deployedUrls,
        lastDeployed: formatLastDeployed(entry.lastDeployed),
        menuActions: buildSystemMenuActions(face.status, screenUrl, usedBy, Boolean(entry.updateAvailable)),
        canRename: false,
        ...(usedBy ? { linked: { label: 'Used by' as const, cards: [usedBy] } } : {}),
    });
}

/**
 * A removal that stopped on a clean-up that did not finish: the face says so,
 * the drawer says why, and the menu offers to go ahead. While a deploy or a
 * retried removal runs, the live status shows instead.
 */
function withRemovalStopped(entry: IdentifiedAppBuilderComponent, card: IntegrationCardModel): IntegrationCardModel {
    if (!entry.removalStopped || card.status === 'deploying') return card;
    return {
        ...card,
        removalStopped: entry.removalStopped,
        statusLabel: 'Removal stopped',
        dotVariant: 'warning',
        message: entry.removalStopped,
        menuActions: [...card.menuActions, 'remove-anyway'],
    };
}

/** Collapse a raw MeshStatus onto the card vocabulary (config drift = stale). */
export function toMeshCardStatus(status: MeshStatus | undefined): CardStatus {
    switch (status) {
        // 'config-changed' is the dashboard's spelling of stale, and a declined
        // update is still an available one. 'config-incomplete' is NOT here: it
        // means required config is missing, and collapsing it would relabel the
        // card "Update needed".
        case 'config-changed':
        case 'update-declined':
            return 'stale';
        case undefined:
            return 'checking';
        default:
            return status;
    }
}

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
    const verb = statusVerb(cardStatus);
    const redeploy: CardAction[] = cardStatus === 'deployed' ? ['redeploy'] : [];
    const remove: CardAction[] = componentId ? ['remove'] : [];
    return [...(verb ? [verb] : []), ...redeploy, ...remove];
}

/**
 * The three parts of the Commerce scope, in display order, with the ACCS and
 * PaaS key that each can arrive under.
 *
 * Labels are FIXED, not registry-derived. The registry says "Website code" /
 * "Store code" / "Store view code"; under a "Commerce scope" key the trailing
 * "code" is noise, and the underlying keys differ by backend while the concept
 * does not — three fixed labels make the row read identically on ACCS and PaaS
 * instead of leaking which backend the project is on.
 *
 * Sentence case, matching every other label in the panel ("APIs in use", "Last
 * deploy") and the pickers these names come from.
 *
 * Customer Group is deliberately absent: `ACCS_CUSTOMER_GROUP` is a Catalog
 * Service PRICE modifier, not a location. It sits in the scope-key and staleness
 * lists defensively, but no component declares it, so it reaches no `.env`.
 */
const COMMERCE_SCOPE_PARTS: {
    label: string;
    keys: string[];
    list: keyof CommerceStoreStructure;
}[] = [
    { label: 'Website', keys: [ACCS_WEBSITE_CODE, PAAS_WEBSITE_CODE], list: 'websites' },
    { label: 'Store', keys: [ACCS_STORE_CODE, PAAS_STORE_CODE], list: 'storeGroups' },
    {
        label: 'Store view',
        keys: [ACCS_STORE_VIEW_CODE, PAAS_STORE_VIEW_CODE],
        list: 'storeViews',
    },
];

/**
 * Read the deployed Commerce scope off a mesh entry's captured `.env` snapshot,
 * naming each code from the persisted store structure.
 *
 * The CODES decide which parts exist; the structure only supplies labels. Because
 * the lookup is BY CODE, a name can never land on the wrong one — no pairing to
 * check, no snapshot to keep in step. A code the structure does not contain (or a
 * project where discovery has never run) renders bare, which is correct rather
 * than degraded.
 *
 * @param envVars - `meshEntry.envVars`, what the mesh was actually deployed with
 * @param structure - `project.commerceStoreStructure`, the discovered hierarchy
 * @returns the parts that carry a code, or undefined when none do
 */
function deriveCommerceScope(
    envVars: Record<string, string> | undefined,
    structure: CommerceStoreStructure | undefined,
): CommerceScopePart[] | undefined {
    if (!envVars) return undefined;

    const parts: CommerceScopePart[] = [];
    for (const { label, keys, list } of COMMERCE_SCOPE_PARTS) {
        // Blank is not a value: an empty code renders as a label with nothing
        // beside it, which reads as broken rather than as "not set".
        const key = keys.find((candidate) => envVars[candidate]);
        if (!key) continue;

        const code = envVars[key];
        const name = structure?.[list].find((entity) => entity.code === code)?.name;
        parts.push(name ? { label, code, name } : { label, code });
    }
    return parts.length > 0 ? parts : undefined;
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
    storeStructure?: CommerceStoreStructure,
): IntegrationCardModel {
    const cardStatus = toMeshCardStatus(status);
    const shared = getStatusDisplay(cardStatus);
    const label = shared?.label ?? '';
    const dot = severityToDot(shared?.severity ?? 'neutral');

    // The live text wins ONLY while transient: those three states carry detail the
    // table cannot hold — the deploy step in flight, and the in-flight verb the
    // notification is showing. Every settled state reads from the table, so the
    // mesh card and its integration peers cannot describe one state two ways.
    const isTransient =
        cardStatus === 'checking' || cardStatus === 'needs-auth' || cardStatus === 'deploying';

    return {
        id: 'mesh',
        isMesh: true,
        name: 'API Mesh',
        kindLabel: 'API Mesh',
        sourceIsAi: false,
        status: cardStatus,
        statusLabel: isTransient ? statusDisplay.text : label,
        dotVariant: dot,
        // The label is the live status text; the REASON comes off the persisted
        // entry, so an errored mesh can still explain itself after a reload.
        message: cardStatus === 'error' ? meshEntry?.error : undefined,
        url: meshEntry?.endpoint,
        urlLabel: 'Endpoint',
        lastDeployed: formatLastDeployed(meshEntry?.lastDeployed),
        // The mesh has no display name to change (canRename false) and no API
        // access of its own, so the menu holds only the two verbs that apply:
        // Redeploy on a healthy idle mesh, and Remove whenever a mesh component
        // actually exists to tear down. Both are deliberate actions, which is why
        // they live here rather than on the face. Withheld while an op is in
        // flight: an action you cannot take is not offered.
        menuActions: meshMenuActions(cardStatus, isActionDisabled, meshComponentId),
        componentId: meshComponentId,
        canRename: false,
        // Off the SAME entry the endpoint and last-deploy come from — the scope
        // is already persisted, already correct, and already in hand.
        commerceScope: deriveCommerceScope(meshEntry?.envVars, storeStructure),
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
    catalog?: readonly AppBuilderComponentCatalogEntry[],
): IntegrationCardModel {
    const entry = catalog?.find((e) => e.id === id) ?? getAppBuilderComponentEntry(id);
    const synthetic: IdentifiedAppBuilderComponent = {
        id,
        kind: entry?.kind === 'system' ? 'system' : 'integration',
        status: 'not-deployed',
        name: entry?.name,
        source: entry?.source ?? { owner: '', repo: '' },
    };
    const card =
        synthetic.kind === 'system'
            ? deriveSystemCard(synthetic, override, undefined, catalog)
            : deriveIntegrationCard(synthetic, override);
    return { ...card, canRename: false };
}

/**
 * Assemble the grid's integration and system cards: each integration followed
 * by the systems it uses (the stored link, `appBuilderComponentLinks`), then any
 * system no present integration uses, then a synthesized pending card per
 * unknown-id 'deploying' override. Terminal-status orphan overrides are
 * ignored — a removed card must not resurrect from its last push.
 */
export function buildIntegrationCards(
    components: IdentifiedAppBuilderComponent[],
    overrides: Record<string, RowStatusOverride>,
    catalog?: readonly AppBuilderComponentCatalogEntry[],
    meshCardComponentId?: string,
): IntegrationCardModel[] {
    // An EMPTY catalog means the caller has not loaded one yet, not that there
    // are no pairs: the bundled catalog is what the per-entry lookups already
    // fall back to, so the links agree with the badges either way.
    const links = catalog?.length ? catalog : getAppBuilderComponentCatalog();
    const project = { appBuilderComponents: Object.fromEntries(components.map(({ id, ...state }) => [id, state])) };
    const byId = new Map(components.map((component) => [component.id, component]));
    const placed = new Set<string>();
    const cards: IntegrationCardModel[] = [];

    for (const integration of components.filter((component) => component.kind === 'integration')) {
        const systemIds = systemsUsedBy(project, integration.id, links);
        // The integration's own card, known before its systems' cards name it.
        const own = deriveIntegrationCard(integration, overrides[integration.id]);
        const systems = systemIds.flatMap((systemId) => {
            const system = byId.get(systemId);
            return system ? [deriveSystemCard(system, overrides[systemId], toLinkedCard(own), links)] : [];
        });
        cards.push(deriveIntegrationCard(integration, overrides[integration.id], systems.map(toLinkedCard)), ...systems);
        placed.add(integration.id);
        for (const system of systems) placed.add(system.id);
    }
    for (const system of components.filter((component) => component.kind === 'system' && !placed.has(component.id))) {
        cards.push(deriveSystemCard(system, overrides[system.id], undefined, links));
        placed.add(system.id);
    }

    // Ids already on screen. `components` includes the mesh's record, but the
    // mesh card is derived elsewhere: WITHOUT the caller naming its mesh card's
    // component id the mesh's own row status reads as an unknown-id push and
    // synthesizes a duplicate — which is what put "API Mesh — MESH DEPLOYED"
    // beside "EDS ACCS API Mesh — REMOVING MESH" during a removal (2026-08-04,
    // live).
    //
    // The caller passes it only when a mesh card is actually rendered. During an
    // ADD there is no mesh yet and so no derived card, and then the synthesized
    // card is the only feedback the operation has — suppressing it by kind
    // instead would trade a duplicate for silence.
    if (meshCardComponentId) {
        placed.add(meshCardComponentId);
    }

    for (const [id, override] of Object.entries(overrides)) {
        if (!placed.has(id) && override.status === 'deploying') {
            cards.push(synthesizePendingCard(id, override, links));
        }
    }

    return cards;
}
