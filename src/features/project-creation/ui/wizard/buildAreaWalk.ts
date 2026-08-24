/**
 * buildAreaWalk — the Build-Your-Project linear driver.
 *
 * Pure derivation over wizard state (no React hooks), which is why it is NOT
 * named use* — it may be called after the container's early config-error
 * return without violating the Rules of Hooks.
 *
 * On `build-your-project`, the visible build areas are walked via the footer
 * Continue/Back (the linear driver) AND shown as children under the Build step
 * in the rail — click a REACHED area to jump back. Extracted verbatim from
 * WizardContainer (2026-08-24 function-length pass); behavior unchanged.
 */

import type { TimelineStatus, TimelineStep } from '@/core/ui/components/TimelineNav';
import { areaSubSteps } from '@/features/project-creation/ui/steps/areaSubSteps';
import { buildYourProjectAreas } from '@/features/project-creation/ui/steps/buildYourProjectAreas';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

interface BuildAreaWalkArgs {
    state: WizardState;
    stacks: Stack[];
    currentStepIndex: number;
    updateState: (partial: Partial<WizardState>) => void;
    goNext: () => Promise<void> | void;
    goBack: () => void;
}

interface BuildAreaWalk {
    activeAreaId: string | undefined;
    buildChildSteps: TimelineStep[];
    buildChildStatusById: Record<string, TimelineStatus>;
    handleAreaClick: (areaId: string) => void;
    handleNext: () => void;
    handleBack: () => void;
    canGoBack: boolean;
}

export function buildAreaWalk({
    state,
    stacks,
    currentStepIndex,
    updateState,
    goNext,
    goBack,
}: BuildAreaWalkArgs): BuildAreaWalk {
    // `buildAreas` is the ordered, visible areas for the current stack.
    const onBuildStep = state.currentStep === 'build-your-project';
    const buildAreas = onBuildStep ? buildYourProjectAreas(state, stacks) : [];
    const activeAreaId = state.activeBuildArea ?? buildAreas[0]?.id;
    const activeAreaIndex = buildAreas.findIndex((a) => a.id === activeAreaId);

    // Rail children: the areas under the (current) Build step, with per-area status.
    const buildChildSteps: TimelineStep[] = buildAreas.map((a) => ({ id: a.id, name: a.label }));
    const buildChildStatusById = Object.fromEntries(buildAreas.map((a) => [a.id, a.status]));

    // The footer Continue/Back is the single LINEAR driver: it walks an area's
    // SUB-STEPS → AREAS → wizard steps. The active area's sub-step DRIVER (Commerce /
    // Storefront; null for an area with no sub-steps, e.g. Integrations) generalizes
    // the walk; its ordered sub-steps + the active one come from state.
    const activeDriver = onBuildStep ? areaSubSteps(activeAreaId) : null;
    const subSteps = activeDriver ? activeDriver.subSteps(state) : [];
    const activeSub = activeDriver ? activeDriver.active(state) : null;
    const nextSub = activeDriver ? activeDriver.next(state) : null;
    const prevSub = activeDriver ? activeDriver.prev(state) : null;

    /** When Continue/Back lands on an area, pin its FIRST/LAST sub-step (no-op if none). */
    const areaEntry = (toAreaId: string | undefined, atEnd: boolean): Partial<WizardState> =>
        areaSubSteps(toAreaId)?.entry(state, atEnd) ?? {};

    /** Jump to a REACHED rail area (at or before the active one); forward stays gated to Continue. */
    const handleAreaClick = (areaId: string): void => {
        const idx = buildAreas.findIndex((a) => a.id === areaId);
        if (idx < 0 || idx > activeAreaIndex) return;
        updateState({ activeBuildArea: buildAreas[idx].id, ...areaEntry(areaId, false) });
    };

    // Continue: next sub-step (within the active area) → next visible area (entering it
    // at its first sub-step) → next wizard step. Pressing Continue COMMITS the current
    // sub-step via the driver (Commerce's commit-gated ✓; a no-op for areas without it),
    // so an auto-detected value never shows ✓ on form validity alone.
    const handleNext = (): void => {
        const commit: Partial<WizardState> =
            activeDriver && activeSub ? activeDriver.commit(state, activeSub) : {};
        if (activeDriver && nextSub) {
            updateState({ ...commit, ...activeDriver.setActive(nextSub) });
            return;
        }
        if (onBuildStep && activeAreaIndex >= 0 && activeAreaIndex < buildAreas.length - 1) {
            const next = buildAreas[activeAreaIndex + 1];
            updateState({ ...commit, activeBuildArea: next.id, ...areaEntry(next.id, false) });
            return;
        }
        if (Object.keys(commit).length > 0) {
            updateState(commit);
        }
        void goNext();
    };

    // Back: previous sub-step (within the active area) → previous visible area
    // (entering it at its LAST sub-step) → previous wizard step.
    const handleBack = (): void => {
        if (activeDriver && prevSub) {
            // Match the main timeline: stepping BACK un-commits the target sub-step and
            // everything after it (driver no-op when there's no commit-gating).
            const order = subSteps.map((s) => s.id);
            updateState({
                ...activeDriver.setActive(prevSub),
                ...activeDriver.uncommit(state, order, prevSub),
            });
            return;
        }
        if (onBuildStep && activeAreaIndex > 0) {
            const prev = buildAreas[activeAreaIndex - 1];
            updateState({ activeBuildArea: prev.id, ...areaEntry(prev.id, true) });
            return;
        }
        goBack();
    };

    // Back is available when there is a previous wizard step, a previous area,
    // or a previous sub-step within the active area.
    const canGoBack =
        currentStepIndex > 0 || (onBuildStep && activeAreaIndex > 0) || Boolean(prevSub);

    return {
        activeAreaId,
        buildChildSteps,
        buildChildStatusById,
        handleAreaClick,
        handleNext,
        handleBack,
        canGoBack,
    };
}
