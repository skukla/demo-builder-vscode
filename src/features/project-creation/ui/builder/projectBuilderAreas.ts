/**
 * Project Builder Areas (Slice 2 — Step 1)
 *
 * Pure, side-effect-free helper that derives the LEFT-rail areas of the
 * two-column Project Builder step from WizardState. The rail (Step 4) and the
 * step (Step 5) consume this — no React here.
 *
 * Areas (in order): Architecture, App Builder Components, Block Libraries.
 * Block Libraries is OMITTED for non-EDS stacks, mirroring ArchitectureModal's
 * `steps` gating (block-libraries only when the selected stack is EDS).
 *
 * Ready-gating mirrors the modal: Architecture is always ready; App Builder
 * Components and Block Libraries are greyed (not ready) until a stack is chosen.
 * `isReadyToProceed` is the single "stack chosen" prefix gate that feeds
 * setCanProceed (required components auto-include via
 * computeSelectedAppBuilderComponents elsewhere).
 *
 * @module features/project-creation/ui/builder/projectBuilderAreas
 */

import demoPackagesConfig from '../../config/demo-packages.json';
import {
    getSelectableAppBuilderComponents as defaultGetSelectableAppBuilderComponents,
    type SelectableAppBuilderComponent,
} from '../../services/appBuilderComponentSelection';
import { getAvailableBlockLibraries as defaultGetAvailableBlockLibraries } from '../../services/blockLibraryLoader';
import { getStackById as defaultGetStackById } from '../hooks/useSelectedStack';
import { computeSelectedAppBuilderComponents } from '../wizard/appBuilderComponentSelectionState';
import type { BlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage, DemoPackagesConfig } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

/** The frontend id that marks an EDS stack (has block libraries). */
const EDS_FRONTEND_ID = 'eds-storefront';

/** Identifier for a Project Builder rail area. */
export type BuilderAreaId = 'architecture' | 'app-builder-components' | 'block-libraries';

/** Whether an area's selection is required or purely optional. */
export type BuilderAreaRequirement = 'required' | 'optional';

/** One LEFT-rail area descriptor (status + summary the rail renders). */
export interface BuilderArea {
    /** Stable area id (also the active-area key). */
    id: BuilderAreaId;
    /** Human-readable rail label. */
    label: string;
    /** Whether the area is selectable yet (greyed when false). */
    ready: boolean;
    /** Required/optional tag, or undefined when not applicable. */
    requirement?: BuilderAreaRequirement;
    /** Short status summary (e.g. "EDS + PaaS", "2 selected", "None yet"). */
    summary: string;
}

/**
 * Injectable service seams. Defaults point at the real loaders; tests pass
 * stubs (the seam-injection standard — avoids mocking the JSON leaf modules).
 */
export interface BuildBuilderAreasDeps {
    getPackageById: (packageId: string) => DemoPackage | undefined;
    getStackById: (stackId: string) => Stack | undefined;
    getSelectableAppBuilderComponents: (
        pkg: DemoPackage,
        backendId: string,
        frontendId: string,
    ) => SelectableAppBuilderComponent[];
    getAvailableBlockLibraries: (stack: Stack, packageId: string) => BlockLibrary[];
}

/**
 * Synchronous package lookup against the bundled demo-packages.json. The loader's
 * getPackageById is async; this helper stays pure, so it reads the same config
 * directly (mirroring getStackById's sync read of stacks.json). Tests inject a stub.
 */
function syncGetPackageById(packageId: string): DemoPackage | undefined {
    const config = demoPackagesConfig as unknown as DemoPackagesConfig;
    return config.packages.find(p => p.id === packageId);
}

/** Default deps wired to the real services. */
const DEFAULT_DEPS: BuildBuilderAreasDeps = {
    getPackageById: syncGetPackageById,
    getStackById: defaultGetStackById,
    getSelectableAppBuilderComponents: defaultGetSelectableAppBuilderComponents,
    getAvailableBlockLibraries: defaultGetAvailableBlockLibraries,
};

/** Count + summary string for a selectable-count area ("N selected" / "None yet"). */
function countSummary(count: number): string {
    return count > 0 ? `${count} selected` : 'None yet';
}

/** Build the App Builder Components area descriptor. */
function buildAppBuilderComponentsArea(
    state: WizardState,
    stack: Stack | undefined,
    pkg: DemoPackage | undefined,
    deps: BuildBuilderAreasDeps,
): BuilderArea {
    const ready = Boolean(state.selectedStack);
    if (!ready || !stack || !pkg) {
        return {
            id: 'app-builder-components',
            label: 'App Builder Components',
            ready,
            requirement: 'optional',
            summary: 'None yet',
        };
    }

    const selectable = deps.getSelectableAppBuilderComponents(pkg, stack.backend, stack.frontend);
    const requiredIds = selectable.filter(c => c.requirement === 'required').map(c => c.id);
    const effective = computeSelectedAppBuilderComponents(
        state.selectedAppBuilderComponents,
        requiredIds,
    );
    const requirement: BuilderAreaRequirement = requiredIds.length > 0 ? 'required' : 'optional';

    return {
        id: 'app-builder-components',
        label: 'App Builder Components',
        ready,
        requirement,
        summary: countSummary(effective.length),
    };
}

/** Build the Block Libraries area descriptor (EDS-only; caller gates inclusion). */
function buildBlockLibrariesArea(state: WizardState): BuilderArea {
    const ready = Boolean(state.selectedStack);
    const count = state.selectedBlockLibraries?.length ?? 0;
    return {
        id: 'block-libraries',
        label: 'Block Libraries',
        ready,
        requirement: 'optional',
        summary: countSummary(count),
    };
}

/**
 * Derive the ordered LEFT-rail areas from the wizard state.
 *
 * @param state - The current wizard state (provides selectedStack + selections)
 * @param deps - Injectable service seams (defaults wired to real loaders)
 * @returns Ordered area descriptors; block-libraries omitted for non-EDS stacks
 */
export function buildBuilderAreas(
    state: WizardState,
    deps: BuildBuilderAreasDeps = DEFAULT_DEPS,
): BuilderArea[] {
    const stack = state.selectedStack ? deps.getStackById(state.selectedStack) : undefined;
    const pkg = state.selectedPackage ? deps.getPackageById(state.selectedPackage) : undefined;
    const isEdsStack = stack?.frontend === EDS_FRONTEND_ID;

    const areas: BuilderArea[] = [
        {
            id: 'architecture',
            label: 'Architecture',
            ready: true,
            summary: stack?.name ?? 'Not selected',
        },
        buildAppBuilderComponentsArea(state, stack, pkg, deps),
    ];

    if (isEdsStack) {
        areas.push(buildBlockLibrariesArea(state));
    }

    return areas;
}

/**
 * Whether the builder has enough to advance: a stack must be chosen. Required
 * App Builder components auto-include via computeSelectedAppBuilderComponents,
 * so a stack selection is the only prefix gate.
 *
 * @param state - The current wizard state
 * @returns true once a non-empty stack id is selected
 */
export function isReadyToProceed(state: WizardState): boolean {
    return Boolean(state.selectedStack);
}
