/**
 * The integration card's data contract — what a card face and any detail view
 * render, independent of where the data came from.
 *
 * Split out of `features/dashboard/.../integrationCardModel.ts` when the wizard
 * became a second producer. The DERIVATIONS stay in the dashboard: they read
 * `useDashboardStatus` and `@/features/app-builder/*`, which are live-project
 * concerns and have no meaning before a project is built. Only the shape is
 * shared, so a producer of pre-deploy cards and a producer of live cards render
 * through one component without either importing the other.
 *
 * @module core/ui/components/integrations/integrationCardModel.types
 */

import type { StatusDotVariant } from '@/core/ui/components/ui/StatusDot';
import type { DisplayStatus } from '@/core/ui/utils/statusVocabulary';
import type { SetupChecklistItem } from '@/types/appBuilderComponents';

/**
 * Card status vocabulary — an alias for the shared {@link DisplayStatus}, not a
 * second vocabulary behind a new name. It keeps the `CardStatus` spelling because
 * consumers on BOTH surfaces already write it that way.
 */
export type CardStatus = DisplayStatus;

/** Action identifiers dispatched by a host's single handleAction switch. */
export type CardAction =
    | 'deploy'
    | 'redeploy'
    | 'update'
    | 'retry'
    | 'install'
    // Uninstall then install; offered only when Commerce refused an upgrade.
    | 'reinstall'
    | 'open-admin'
    | 'manage-apis'
    // Opens the integration's Settings modal (AB-21); only on one that has settings.
    | 'settings'
    | 'remove'
    | 'sign-in'
    // An integration: its Adobe workspace in the Developer Console. A system: its
    // own screen.
    | 'open'
    // An integration's deployed address, from the flyout's address row.
    | 'open-url'
    // A system card's reset of its records (the ERP's; it runs through the
    // integration that uses it).
    | 'reset-records'
    // After a removal stopped on a clean-up that did not finish: go ahead.
    | 'remove-anyway';

/** Everything a card face, drawer body, and drawer action bar render. */
export interface IntegrationCardModel {
    id: string;
    /**
     * The flyout's Settings row: the current values in one line. Present only on
     * a component that has settings (AB-21).
     */
    settingsSummary?: string;
    /** Why the last removal stopped, when it did; the card offers Remove anyway. */
    removalStopped?: string;
    /** The demo setup steps its catalog entry declares, with where the SC is on each. */
    setupChecklist?: SetupChecklistItem[];
    isMesh: boolean;
    name: string;
    kindLabel: string;
    /**
     * `owner/repo` — an identifier you can go look up, which is why the DETAIL
     * PANEL typesets it in mono. Not the card face: that renders no source line
     * at all (see `IntegrationCard`). This sentence said "the card" until
     * 2026-08-15 — it moved here verbatim from the dashboard, where it was
     * already describing a treatment the card had stopped applying.
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
    urlLabel: 'Endpoint' | 'App URL' | 'Screen';
    deployedUrls?: Record<string, string>;
    apis?: string[];
    /** Preformatted locale display string (already display-ready). */
    lastDeployed?: string;
    /**
     * The card's own kebab menu. Kept OFF the face so the at-most-one-affordance
     * rule survives: the face carries the urgent verb (Deploy / Update / Retry),
     * the menu carries the deliberate ones. Empty on the mesh (nothing about it
     * is editable) and while deploying.
     */
    menuActions: CardAction[];
    /**
     * True when the package locks this component into the build (a required
     * mesh in the wizard). The producer withholds Remove from `menuActions`;
     * this flag lets the subline say why. Dashboard cards never set it.
     */
    required?: boolean;
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
    /**
     * The App Management install outcome (lifecycle 'app-management' apps
     * only) — the persisted `appBuilderComponents[id].installation` record,
     * display-ready. `failed` also drives the drawer's "Install into
     * Commerce" retry action, or "Reinstall in Commerce" when
     * `needsReinstall`. Absent on every other card, so no row renders.
     */
    installation?: {
        /** Display label: 'Installed' or 'Not installed'. */
        label: string;
        /** The no-op reason on skip, or the hands-back line on failure. */
        detail?: string;
        /** Preformatted locale display string of the attempt. */
        at?: string;
        failed: boolean;
        /** Commerce refused an in-place upgrade; only a reinstall applies the new version. */
        needsReinstall?: boolean;
    };
    /**
     * The Commerce scope the mesh is DEPLOYED against, in display order.
     *
     * An attribute of the deployment, not a difference — which is why it is a
     * permanent row rather than a stale-only diff. Mesh cards only; integrations
     * have no Commerce scope. Absent when the deployed snapshot carries no codes
     * (a mesh deployed before this shipped, or never deployed at all).
     */
    commerceScope?: CommerceScopePart[];
    /**
     * A SYSTEM card (the ERP an integration uses), not an integration. Its
     * `url` is its screen, opened through the extension because the link needs a
     * key the webview never holds.
     */
    isSystem?: boolean;
    /** What kind of system it is ("ERP"), shown as a badge. System cards only. */
    typeBadge?: string;
    /**
     * The cards this one is linked to: the systems an integration uses ("Uses")
     * or the integration a system belongs to ("Used by"). Absent when none.
     */
    linked?: { label: 'Uses' | 'Used by'; cards: LinkedCard[] };
}

/** A card this one is linked to, as the face and the flyout name it. */
export interface LinkedCard {
    id: string;
    name: string;
    statusLabel: string;
    dotVariant: StatusDotVariant;
    status: CardStatus;
}

/** One sub-labelled line of the Commerce scope row. */
export interface CommerceScopePart {
    label: string;
    code: string;
    /**
     * The name the scope was CHOSEN by, when the deployment captured one.
     *
     * Absent on every mesh deployed before names were captured, and on any part
     * the user has not re-picked since. Consumers render the bare code then —
     * that is the correct rendering, not a degraded one.
     */
    name?: string;
}
