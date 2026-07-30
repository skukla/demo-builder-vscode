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
    | 'verify'
    | 'manage-apis'
    | 'remove'
    | 'sign-in'
    | 'open';

/** The attention verbs a card face may surface (everything except Open↗). */
type AttentionKind = 'deploy' | 'update' | 'retry' | 'sign-in';

/**
 * The card face's at-most-one affordance: an attention verb (Deploy / Update /
 * Retry / Sign in) or the deployed Open↗ link. `disabled` is set only by the
 * mesh producer (its actions gate on in-flight operations).
 */
export type FaceAction =
    | { kind: AttentionKind; disabled?: boolean }
    | { kind: 'open'; url: string };

/** One drawer action-bar button. */
export interface BarAction {
    action: CardAction;
    label: string;
    emphasis: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
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

/** Everything a card face, drawer body, and drawer action bar render. */
export interface IntegrationCardModel {
    id: string;
    isMesh: boolean;
    name: string;
    kindLabel: string;
    sourceLine: string;
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
    barActions: BarAction[];
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

const MANAGE_APIS: BarAction = { action: 'manage-apis', label: 'Manage APIs', emphasis: 'secondary' };
const REMOVE: BarAction = { action: 'remove', label: 'Remove', emphasis: 'danger' };
const VERIFY: BarAction = { action: 'verify', label: 'Verify', emphasis: 'secondary' };

/**
 * The integration action matrix: face verb + drawer bar per status. Manage
 * APIs appears pre-deploy too (intended — `setConsoleApis` is
 * workspace-scoped, not deployment-scoped); Remove(danger) everywhere except
 * deploying; deploying is action-free (pulse only).
 */
const INTEGRATION_ACTIONS: Record<
    IntegrationStatus,
    { face?: FaceAction; bar: BarAction[] }
> = {
    'not-deployed': {
        face: { kind: 'deploy' },
        bar: [{ action: 'deploy', label: 'Deploy', emphasis: 'primary' }, MANAGE_APIS, REMOVE],
    },
    deploying: { bar: [] },
    deployed: {
        // face resolved per-card: { kind: 'open', url } only when a url exists
        bar: [
            { action: 'redeploy', label: 'Redeploy', emphasis: 'secondary' },
            VERIFY,
            MANAGE_APIS,
            REMOVE,
        ],
    },
    stale: {
        face: { kind: 'update' },
        bar: [{ action: 'update', label: 'Update', emphasis: 'primary' }, VERIFY, MANAGE_APIS, REMOVE],
    },
    error: {
        face: { kind: 'retry' },
        bar: [{ action: 'retry', label: 'Retry', emphasis: 'primary' }, MANAGE_APIS, REMOVE],
    },
};

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
            kindLabel: 'Custom · built with AI',
            sourceLine: 'Built with AI',
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
    const { label: statusLabel, dot: dotVariant } = INTEGRATION_STATUS_DISPLAY[status];
    const actions = INTEGRATION_ACTIONS[status];
    const openFace: FaceAction | undefined =
        status === 'deployed' && primaryUrl ? { kind: 'open', url: primaryUrl } : undefined;

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
        message: override?.message,
        url: primaryUrl,
        urlLabel: 'App URL',
        deployedUrls: entry.deployedUrls,
        apis: facet.apis,
        lastDeployed: formatLastDeployed(entry.lastDeployed),
        faceAction: actions.face ? { ...actions.face } : openFace,
        barActions: actions.bar.map((action) => ({ ...action })),
        canRename: entry.kind === 'integration' && !facet.isCatalog,
    };
}

/** Collapse a raw MeshStatus onto the card vocabulary (config drift = stale). */
function toMeshCardStatus(status: MeshStatus | undefined): CardStatus {
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
 * The mesh action matrix: dot + face verb + bar per card status. No Manage
 * APIs and no Remove anywhere (the mesh's lifecycle is owned by the project
 * configuration); the deployed card has NO Open↗ face (see module doc).
 */
const MESH_MATRIX: Record<
    CardStatus,
    { dot: StatusDotVariant; face?: AttentionKind; bar?: Omit<BarAction, 'disabled'> }
> = {
    checking: { dot: 'neutral' },
    'needs-auth': {
        dot: 'warning',
        face: 'sign-in',
        bar: { action: 'sign-in', label: 'Sign in', emphasis: 'primary' },
    },
    'not-deployed': {
        dot: 'neutral',
        face: 'deploy',
        bar: { action: 'deploy', label: 'Deploy', emphasis: 'primary' },
    },
    deploying: { dot: 'info' },
    deployed: {
        dot: 'success',
        bar: { action: 'redeploy', label: 'Redeploy', emphasis: 'secondary' },
    },
    stale: {
        dot: 'warning',
        face: 'update',
        bar: { action: 'update', label: 'Update', emphasis: 'primary' },
    },
    error: {
        dot: 'error',
        face: 'retry',
        bar: { action: 'retry', label: 'Retry', emphasis: 'primary' },
    },
};

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
): IntegrationCardModel {
    const cardStatus = toMeshCardStatus(status);
    const row = MESH_MATRIX[cardStatus];

    return {
        id: 'mesh',
        isMesh: true,
        name: 'API Mesh',
        kindLabel: 'API Mesh',
        sourceLine: 'GraphQL bridge · Adobe I/O',
        sourceIsAi: false,
        status: cardStatus,
        statusLabel: statusDisplay.text,
        dotVariant: row.dot,
        url: meshEntry?.endpoint,
        urlLabel: 'Endpoint',
        lastDeployed: formatLastDeployed(meshEntry?.lastDeployed),
        faceAction: row.face ? { kind: row.face, disabled: isActionDisabled } : undefined,
        barActions: row.bar ? [{ ...row.bar, disabled: isActionDisabled }] : [],
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
