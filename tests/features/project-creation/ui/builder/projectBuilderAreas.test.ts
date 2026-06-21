/**
 * projectBuilderAreas Tests (Slice 2 — Step 1)
 *
 * Pure helper that derives the Project Builder LEFT-rail areas from WizardState.
 * Covers the area list + ordering, the EDS-only block-libraries gating, the
 * ready-before/after-stack transitions, the per-area summaries, and the
 * isReadyToProceed prefix gate.
 */

import {
    buildBuilderAreas,
    isReadyToProceed,
    type BuildBuilderAreasDeps,
} from '@/features/project-creation/ui/builder/projectBuilderAreas';
import type { SelectableAppBuilderComponent } from '@/features/project-creation/services/appBuilderComponentSelection';
import type { BlockLibrary } from '@/types/blockLibraries';
import type { DemoPackage } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import type { WizardState } from '@/types/webview';

const edsStack: Stack = {
    id: 'eds-paas',
    name: 'EDS + PaaS',
    description: 'Edge Delivery with PaaS backend',
    frontend: 'eds-storefront',
    backend: 'adobe-commerce-paas',
    dependencies: [],
};

const headlessStack: Stack = {
    id: 'headless-paas',
    name: 'Headless + PaaS',
    description: 'Headless storefront with PaaS backend',
    frontend: 'headless',
    backend: 'adobe-commerce-paas',
    dependencies: [],
};

const testPackage: DemoPackage = {
    id: 'citisignal',
    name: 'CitiSignal',
    description: 'A test package',
    configDefaults: {},
    storefronts: {},
};

function makeState(overrides: Partial<WizardState> = {}): WizardState {
    return {
        currentStep: 'welcome',
        projectName: '',
        selectedPackage: 'citisignal',
        adobeAuth: { isAuthenticated: false, isChecking: false },
        ...overrides,
    } as WizardState;
}

/** Build a deps object with injectable stubs (defaults supplied per-test). */
function makeDeps(overrides: Partial<BuildBuilderAreasDeps> = {}): BuildBuilderAreasDeps {
    return {
        getPackageById: () => testPackage,
        getStackById: (id: string) => {
            if (id === edsStack.id) return edsStack;
            if (id === headlessStack.id) return headlessStack;
            return undefined;
        },
        getSelectableAppBuilderComponents: () => [],
        getAvailableBlockLibraries: () => [],
        ...overrides,
    };
}

function makeAppBuilderComponent(
    id: string,
    requirement: 'required' | 'optional',
): SelectableAppBuilderComponent {
    return {
        id,
        name: id,
        description: '',
        kind: 'mesh',
        source: { owner: 'o', repo: 'r', branch: 'main' },
        requirement,
    } as SelectableAppBuilderComponent;
}

function makeBlockLibrary(id: string): BlockLibrary {
    return {
        id,
        name: id,
        description: '',
        stackTypes: ['eds-storefront'],
        source: { owner: 'o', repo: 'r', branch: 'main' },
    } as BlockLibrary;
}

describe('buildBuilderAreas', () => {
    describe('area list and ordering', () => {
        it('returns architecture first', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas[0].id).toBe('architecture');
        });

        it('returns app-builder-components second', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas[1].id).toBe('app-builder-components');
        });

        it('omits block-libraries when no stack is selected', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'block-libraries')).toBeUndefined();
        });

        it('includes block-libraries as third area for an EDS stack', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas[2].id).toBe('block-libraries');
        });

        it('omits block-libraries for a non-EDS stack', () => {
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'block-libraries')).toBeUndefined();
        });

        it('returns exactly 2 areas for a non-EDS stack', () => {
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas).toHaveLength(2);
        });

        it('returns exactly 3 areas for an EDS stack', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas).toHaveLength(3);
        });
    });

    describe('area labels', () => {
        it('labels architecture "Architecture"', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'architecture')?.label).toBe('Architecture');
        });

        it('labels app-builder-components "App Builder Components"', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'app-builder-components')?.label).toBe(
                'App Builder Components',
            );
        });

        it('labels block-libraries "Block Libraries"', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'block-libraries')?.label).toBe('Block Libraries');
        });
    });

    describe('ready gating', () => {
        it('marks architecture ready even without a stack', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'architecture')?.ready).toBe(true);
        });

        it('marks app-builder-components NOT ready before a stack is selected', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'app-builder-components')?.ready).toBe(false);
        });

        it('marks app-builder-components ready once a stack is selected', () => {
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'app-builder-components')?.ready).toBe(true);
        });

        it('marks block-libraries ready once an EDS stack is selected', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'block-libraries')?.ready).toBe(true);
        });
    });

    describe('architecture summary', () => {
        it('summarizes "Not selected" when no stack is chosen', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'architecture')?.summary).toBe('Not selected');
        });

        it('summarizes the selected stack name', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'architecture')?.summary).toBe('EDS + PaaS');
        });
    });

    describe('app-builder-components summary', () => {
        it('summarizes "None yet" when no stack is selected', () => {
            const areas = buildBuilderAreas(makeState(), makeDeps());
            expect(areas.find(a => a.id === 'app-builder-components')?.summary).toBe('None yet');
        });

        it('counts required components even when none are toggled', () => {
            const deps = makeDeps({
                getSelectableAppBuilderComponents: () => [
                    makeAppBuilderComponent('commerce-paas-mesh', 'required'),
                ],
            });
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'app-builder-components')?.summary).toBe('1 selected');
        });

        it('counts toggled optional components plus required', () => {
            const deps = makeDeps({
                getSelectableAppBuilderComponents: () => [
                    makeAppBuilderComponent('commerce-paas-mesh', 'required'),
                    makeAppBuilderComponent('extra-component', 'optional'),
                ],
            });
            const state = makeState({
                selectedStack: headlessStack.id,
                selectedAppBuilderComponents: ['extra-component'],
            });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'app-builder-components')?.summary).toBe('2 selected');
        });

        it('summarizes "None yet" when a stack offers no required components and none toggled', () => {
            const deps = makeDeps({
                getSelectableAppBuilderComponents: () => [
                    makeAppBuilderComponent('extra-component', 'optional'),
                ],
            });
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'app-builder-components')?.summary).toBe('None yet');
        });
    });

    describe('app-builder-components requirement tag', () => {
        it('tags optional when stack offers only optional components', () => {
            const deps = makeDeps({
                getSelectableAppBuilderComponents: () => [
                    makeAppBuilderComponent('extra-component', 'optional'),
                ],
            });
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'app-builder-components')?.requirement).toBe('optional');
        });

        it('tags required when stack offers a required component', () => {
            const deps = makeDeps({
                getSelectableAppBuilderComponents: () => [
                    makeAppBuilderComponent('commerce-paas-mesh', 'required'),
                ],
            });
            const state = makeState({ selectedStack: headlessStack.id });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'app-builder-components')?.requirement).toBe('required');
        });
    });

    describe('block-libraries summary', () => {
        it('summarizes "None yet" when none are selected', () => {
            const deps = makeDeps({
                getAvailableBlockLibraries: () => [makeBlockLibrary('isle5')],
            });
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'block-libraries')?.summary).toBe('None yet');
        });

        it('counts selected block libraries', () => {
            const deps = makeDeps({
                getAvailableBlockLibraries: () => [
                    makeBlockLibrary('isle5'),
                    makeBlockLibrary('demo-team-blocks'),
                ],
            });
            const state = makeState({
                selectedStack: edsStack.id,
                selectedBlockLibraries: ['isle5', 'demo-team-blocks'],
            });
            const areas = buildBuilderAreas(state, deps);
            expect(areas.find(a => a.id === 'block-libraries')?.summary).toBe('2 selected');
        });

        it('tags block-libraries optional', () => {
            const state = makeState({ selectedStack: edsStack.id });
            const areas = buildBuilderAreas(state, makeDeps());
            expect(areas.find(a => a.id === 'block-libraries')?.requirement).toBe('optional');
        });
    });
});

describe('isReadyToProceed', () => {
    it('is false when no stack is selected', () => {
        expect(isReadyToProceed(makeState())).toBe(false);
    });

    it('is true once a stack is selected', () => {
        expect(isReadyToProceed(makeState({ selectedStack: edsStack.id }))).toBe(true);
    });

    it('is false for an empty-string stack', () => {
        expect(isReadyToProceed(makeState({ selectedStack: '' }))).toBe(false);
    });
});
