/**
 * IntegrationsStep — the Integrations area body: RESULTS ONLY.
 *
 * The center column is the shared {@link IntegrationCard} — the same card the
 * dashboard's integrations page renders — one per configured integration
 * (resolved purely from wizard state by {@link resolveIntegrationRows}, so a
 * PACKAGE-SEEDED mesh, seeded into selectedAppBuilderComponents by
 * onStackSelect, surfaces automatically), an empty state when nothing is
 * configured, and one accent
 * "Add Integration" launchpad. There is NO sub-step rail — the Build step's
 * footer owns the Continue gate.
 *
 * What the wizard does NOT take from the dashboard, and why: the card GRID and
 * its detail drawer. Pre-deploy there is no status, URL, or redeploy to show,
 * and this column is capped at 720px, where a grid falls to two columns and
 * reads as a second dashboard. That call is recorded in
 * `.rptc/complete/integrations-surface/overview.md` and holds; the card itself
 * is listed there as surface-agnostic, which is what this step reuses.
 *
 * ALL configuration lives in the {@link AddIntegrationFlowModal} journey: the Add
 * button opens it in `add` mode; the destination line's Set up / Change opens it
 * in `destination` mode; a card press or its Manage APIs opens it in `api-edit`
 * mode. Rename is the card's own inline pencil (the dashboard's treatment), which
 * is why there is no rename modal here any more.
 *
 * The destination is rendered ONCE above the list rather than on every card —
 * it is one project and one workspace for the whole build.
 *
 * Remove routing: a mesh row routes through the component toggle
 * ({@link useProjectBuilder.onAppBuilderComponentToggle}, clearing the
 * selection); every other row routes through `onRemoveAppBuilderComponent` (selection +
 * source + API picks). The modal provisions NOTHING — a mesh commits on the
 * modal's destination step, and every integration's APIs (mesh included) are
 * subscribed at the build, not in-modal — so this step is PURELY VISUAL: a card
 * states how MANY APIs it will provision (the names live behind Manage APIs, in
 * the picker), and never triggers a subscribe.
 *
 * @module features/project-creation/ui/steps/IntegrationsStep
 */

import { ActionButton, Button } from '@adobe/react-spectrum';
import React, { useCallback, useMemo, useState } from 'react';
import {
    getSelectableAppBuilderComponents,
    type SelectableAppBuilderComponent,
} from '../../services/appBuilderComponentSelection';
import {
    AddIntegrationFlowModal,
    buildReservedIds,
    isApiEditable,
    resolveIntegrationRows,
    sublineFor,
    toIntegrationCards,
    type ApiEditTarget,
    type FlowMode,
    type IntegrationRow,
} from '../components/integration-flow';
import { meshComponentForStack } from './tileStatus';
import { useProjectBuilder } from './useProjectBuilder';
import {
    IntegrationCard,
    type CardAction,
    type IntegrationCardModel,
} from '@/core/ui/components/integrations';
import { StepAreaShell } from '@/core/ui/components/layout/StepAreaShell';
import { DestinationContext } from '@/core/ui/components/ui/DestinationContext';
import { webviewClient } from '@/core/ui/utils/vscode-api';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';
import type { BaseStepProps } from '@/types/wizard';

/** Stable empty defaults for catalog props (avoids the infinite-re-render gotcha). */
const EMPTY_PACKAGES: DemoPackage[] = [];
const EMPTY_STACKS: Stack[] = [];
/** Stable empty string-array default (API picks seed, reserved-id inputs). */
const EMPTY_PICKS: string[] = [];

export interface IntegrationsStepProps extends BaseStepProps {
    /** Available demo packages (catalog data; drives mesh availability). */
    packages?: DemoPackage[];
    /** Available stacks/architectures (catalog data; drives mesh availability). */
    stacks?: Stack[];
}

/** Case-insensitive, whitespace-trimmed name comparison. */
function sameName(a: string, b: string): boolean {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The destination for the whole surface, shown ONCE above the list.
 *
 * It used to repeat on every card, always printing the same string — there is one
 * Adobe project and one workspace for the entire build, so three integrations
 * printed it three times. `DestinationContext`
 * says so in its own docstring ("one line for the whole surface, never per
 * card") and is the same control the Add-Integration modal and the dashboard's
 * integrations page already use.
 *
 * It renders nothing when either half is missing, so the uncommitted case keeps
 * its own branch rather than silently disappearing.
 */
function DestinationLine({
    state,
    needsSetup,
    onOpenDestination,
}: {
    state: WizardState;
    /**
     * From the resolver (`IntegrationRow.needsSetup`) — NOT recomputed here.
     * `integrationRows.destinationCommitted` already answers this for every row,
     * and `buildSummary` reads the same field; a second copy of the rule in this
     * component would be a third place for it to drift.
     */
    needsSetup: boolean;
    onOpenDestination: () => void;
}): React.ReactElement {
    const project = state.adobeProject;
    const workspace = state.adobeWorkspace;
    return (
        <div className="int-destination">
            <span className="int-destination-label">Deploys to</span>
            {!needsSetup ? (
                <DestinationContext
                    project={project?.title ?? project?.name}
                    workspace={workspace?.title ?? workspace?.name}
                    onChange={onOpenDestination}
                />
            ) : (
                <>
                    <span className="int-destination-unset">Not set</span>
                    <ActionButton isQuiet onPress={onOpenDestination}>
                        Set up
                    </ActionButton>
                </>
            )}
        </div>
    );
}

/** The zero-rows empty state (copy only; the Add button renders regardless). */
function EmptyState({ onAdd }: { onAdd: () => void }): React.ReactElement {
    return (
        <div className="int-results-empty">
            <div className="int-results-empty-title">No integrations yet.</div>
            <div className="int-results-empty-copy">
                Add an API Mesh, a pre-built integration, or your own custom integration — each
                deploys to a shared Adobe I/O project and workspace.
            </div>
            <div className="int-results-empty-action">
                <Button variant="accent" onPress={onAdd}>
                    Add Integration
                </Button>
            </div>
        </div>
    );
}

/**
 * The Integrations area body: result rows + the Add Integration launchpad.
 *
 * @param props - Standard step props plus the package + stack catalog
 * @returns The Integrations surface
 */
export function IntegrationsStep({
    state,
    updateState,
    packages = EMPTY_PACKAGES,
    stacks = EMPTY_STACKS,
}: IntegrationsStepProps): React.ReactElement {
    const builder = useProjectBuilder(state, updateState, { packages, stacks });
    const {
        onAppBuilderComponentToggle,
        onRemoveAppBuilderComponent,
        onRenameAppBuilderComponent,
    } = builder;

    // The one modal, opened in 'add' (launchpad), 'destination' (row Set up/Change),
    // or 'api-edit' (a custom/import row's APIs "Change" → re-open the picker).
    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState<FlowMode>('add');
    // The row being API-edited (mode 'api-edit' only) — seeds the picker with its
    // current picks; passed to the modal only in that mode.
    const [editTarget, setEditTarget] = useState<ApiEditTarget | undefined>(undefined);
    // The WIZARD webview registers `authenticate` (the dashboard's twin is
    // `reAuthenticate`); it resolves once the browser sign-in completes, so the API
    // picker can re-fetch immediately after.
    const signIn = useCallback(
        () => webviewClient.request('authenticate', { force: false }).catch(() => undefined),
        [],
    );

    const openAdd = useCallback((): void => {
        setMode('add');
        setModalOpen(true);
    }, []);
    const openDestination = useCallback((): void => {
        setMode('destination');
        setModalOpen(true);
    }, []);
    const openEditApis = useCallback(
        (row: IntegrationRow): void => {
            setEditTarget({
                componentId: row.id,
                kind: row.kind,
                picks: state.selectedConsoleApis?.[row.id] ?? EMPTY_PICKS,
            });
            setMode('api-edit');
            setModalOpen(true);
        },
        [state.selectedConsoleApis],
    );
    const closeModal = useCallback((): void => setModalOpen(false), []);

    const meshComponent = useMemo(
        () => meshComponentForStack(state, packages, stacks),
        [state, packages, stacks],
    );

    // The selected stack (prop catalog) — drives the integration catalog + mesh
    // enablement axes. The pre-built catalog is empty when no stack is committed.
    const stack = useMemo(
        () => stacks.find((candidate) => candidate.id === state.selectedStack),
        [stacks, state.selectedStack],
    );
    // ALL stack-compatible catalog entries (mesh + integration + blank) — the
    // reserved-id domain needs every catalog id (a blank-instance name slugging
    // to one would clone the wrong repo via the executor's catalog-first lookup).
    // Deliberately UNSCOPED (raw loader): reserved ids must cover entries a
    // package excludes, or a blank instance could slug onto an excluded id.
    const availableEntries = useMemo<AppBuilderComponentCatalogEntry[]>(
        () => getAvailableAppBuilderComponents(stack?.backend ?? '', stack?.frontend ?? ''),
        [stack],
    );
    const pkg = useMemo(
        () => packages.find((candidate) => candidate.id === state.selectedPackage),
        [packages, state.selectedPackage],
    );
    // Integration-kind entries, split: the FINISHED catalog (the "Pre-built
    // integration" gallery) vs. the blank starter app (the "Build custom"
    // card) — the blank is NOT a pre-built integration and never shows in the
    // gallery. From the ANNOTATED, package-scoped selection (not the raw
    // loader): `onlyForPackages` exclusions apply to the gallery, and each
    // entry carries its resolved requirement so a required row locks
    // (`resolveIntegrationRows` reads it).
    const integrationEntries = useMemo<SelectableAppBuilderComponent[]>(
        () =>
            pkg && stack
                ? getSelectableAppBuilderComponents(
                      pkg,
                      stack.backend,
                      stack.frontend,
                      stack.id,
                  ).filter((entry) => entry.kind === 'integration')
                : [],
        [pkg, stack],
    );
    const catalog = useMemo(
        () => integrationEntries.filter((entry) => !entry.blank),
        [integrationEntries],
    );
    const blankComponent = useMemo(
        () => integrationEntries.find((entry) => entry.blank),
        [integrationEntries],
    );

    // The blank-naming collision domain: current selections + custom sources +
    // every stack-compatible catalog id (incl. blank + mesh) + selected addons.
    // Component ids (mesh included) and the '__existing__' key are baked into
    // buildReservedIds itself.
    const reservedIds = useMemo(
        () =>
            buildReservedIds({
                selectedIntegrationIds: state.selectedAppBuilderComponents ?? EMPTY_PICKS,
                sourceIds: Object.keys(state.appBuilderComponentSources ?? {}),
                catalogIds: [
                    ...availableEntries.map((entry) => entry.id),
                    ...(meshComponent ? [meshComponent.id] : []),
                ],
                selectedAddons: state.selectedAddons ?? EMPTY_PICKS,
            }),
        [
            state.selectedAppBuilderComponents,
            state.appBuilderComponentSources,
            state.selectedAddons,
            availableEntries,
            meshComponent,
        ],
    );

    // Resolve rows against the FULL entry list (incl. the blank starter) so a
    // committed "Build custom" app gets a row — `catalog` (blank-filtered) is only
    // the modal's gallery, not the source of truth for configured integrations.
    const rows = useMemo(
        () => resolveIntegrationRows(state, meshComponent, integrationEntries),
        [state, meshComponent, integrationEntries],
    );
    // The same card the dashboard renders, over what the wizard can actually
    // know: identity, origin and API count. No deploy status — nothing is
    // deployed yet, so a status would read the same on every card.
    const cards = useMemo(() => toIntegrationCards(rows), [rows]);
    const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

    const onRemoveRow = useCallback(
        (row: IntegrationRow): void => {
            // Mesh removal routes through the toggle so its required-mesh
            // guard applies (Remove is a second door onto the same lock).
            if (row.kind === 'mesh' && meshComponent) {
                onAppBuilderComponentToggle(meshComponent.id, false);
                return;
            }
            onRemoveAppBuilderComponent(row.id);
        },
        [meshComponent, onAppBuilderComponentToggle, onRemoveAppBuilderComponent],
    );

    /**
     * The card's single action switch — the wizard's answer to the dashboard
     * grid's `handleAction`. Only two verbs reach it: nothing is deployed, so
     * there is no Deploy, Open, or Retry to offer (see `menuActionsFor`).
     */
    const handleCardAction = useCallback(
        (model: IntegrationCardModel, action: CardAction): void => {
            const row = rowsById.get(model.id);
            if (!row) return;
            if (action === 'remove') {
                onRemoveRow(row);
                return;
            }
            if (action === 'manage-apis') {
                openEditApis(row);
            }
        },
        [rowsById, onRemoveRow, openEditApis],
    );

    /**
     * Commit an inline rename — the card's own pencil, matching the dashboard.
     *
     * Replaces the wizard's `RenameIntegrationModal`. Only the duplicate check
     * lives here: `InlineRenameField` already cancels an empty or unchanged name
     * before calling this, so an "enter a name" branch would be unreachable.
     * Display name only — the id, its API picks, and the selection are immutable.
     */
    const commitRename = useCallback(
        async (id: string, raw: string): Promise<string | null> => {
            const trimmed = raw.trim();
            const taken = rows.filter((row) => row.id !== id).map((row) => row.name);
            if (taken.some((name) => sameName(name, trimmed))) {
                return 'That name is already used by another integration.';
            }
            onRenameAppBuilderComponent(id, trimmed);
            return null;
        },
        [rows, onRenameAppBuilderComponent],
    );

    return (
        // Integrations has no sub-steps, so the shell carries the area label alone — no
        // rail, no remount key. Both modals are DialogContainer-hosted (they portal), so
        // living outside the shell rather than inside it changes nothing on screen.
        <>
            <StepAreaShell
                areaLabel="Integrations"
                viewClassName={rows.length === 0 ? 'int-results int-results--empty' : 'int-results'}
            >
                {cards.length === 0 && <EmptyState onAdd={openAdd} />}
                {cards.length > 0 && (
                    <DestinationLine
                        state={state}
                        // Shared across every row by construction, so the first
                        // one speaks for the surface.
                        needsSetup={rows[0]?.needsSetup ?? true}
                        onOpenDestination={openDestination}
                    />
                )}
                {cards.map((card) => {
                    // A press opens the only detail the wizard has: the API
                    // picker. Cards with no editable APIs (mesh, catalog) get no
                    // handler, so they render inert rather than offering a control
                    // that would do nothing.
                    //
                    // Asks `isApiEditable` — the same rule that builds the menu —
                    // rather than reading the menu it produced; those two answers
                    // must never disagree. Guarded on the ROW rather than a
                    // sentinel kind, so "no row" means "not pressable" outright
                    // instead of depending on which kinds happen to be editable.
                    const row = rowsById.get(card.id);
                    return (
                        <IntegrationCard
                            key={card.id}
                            model={card}
                            onAction={handleCardAction}
                            onRename={commitRename}
                            subline={sublineFor(card)}
                            onOpen={
                                row && isApiEditable(row.kind)
                                    ? () => handleCardAction(card, 'manage-apis')
                                    : undefined
                            }
                        />
                    );
                })}
                {cards.length > 0 && (
                    <div className="int-results-add">
                        <Button variant="accent" onPress={openAdd}>
                            Add Integration
                        </Button>
                    </div>
                )}
            </StepAreaShell>
            <AddIntegrationFlowModal
                isOpen={modalOpen}
                onClose={closeModal}
                mode={mode}
                editTarget={mode === 'api-edit' ? editTarget : undefined}
                state={state}
                updateState={updateState}
                meshComponent={meshComponent}
                catalog={catalog}
                blankComponent={blankComponent}
                reservedIds={reservedIds}
                builder={builder}
                onSignIn={signIn}
            />
        </>
    );
}
