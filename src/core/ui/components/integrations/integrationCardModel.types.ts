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
    | 'manage-apis'
    | 'remove'
    | 'sign-in'
    | 'open';

/** Everything a card face, drawer body, and drawer action bar render. */
export interface IntegrationCardModel {
    id: string;
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
    urlLabel: 'Endpoint' | 'App URL';
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
     * The Commerce scope the mesh is DEPLOYED against, in display order.
     *
     * An attribute of the deployment, not a difference — which is why it is a
     * permanent row rather than a stale-only diff. Mesh cards only; integrations
     * have no Commerce scope. Absent when the deployed snapshot carries no codes
     * (a mesh deployed before this shipped, or never deployed at all).
     */
    commerceScope?: CommerceScopePart[];
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
