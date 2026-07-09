/**
 * areaSubSteps tests — the per-area sub-step DRIVER registry that generalizes the
 * Commerce-only walk so Commerce, Storefront (and later Integrations) share it.
 */

import { areaSubSteps } from '@/features/project-creation/ui/steps/areaSubSteps';
import type { WizardState } from '@/types/webview';

const state = (partial: Partial<WizardState>): WizardState => partial as WizardState;

const CONFIGURED_STOREFRONT = {
    storefrontRepoValid: true,
    storefrontCodeSyncValid: true,
    edsConfig: {
        repoName: 'my-repo',
        githubAuth: { isAuthenticated: true },
        daLiveAuth: { isAuthenticated: true },
    },
} as unknown as WizardState;

describe('areaSubSteps registry', () => {
    it('returns a driver for commerce, storefront and integrations, null otherwise', () => {
        expect(areaSubSteps('commerce')).not.toBeNull();
        expect(areaSubSteps('storefront')).not.toBeNull();
        expect(areaSubSteps('integrations')).not.toBeNull();
        expect(areaSubSteps('nope')).toBeNull();
        expect(areaSubSteps(undefined)).toBeNull();
    });
});

describe('storefront driver', () => {
    const driver = areaSubSteps('storefront')!;

    it('lists the sub-steps for an existing repo (no Code Sync), active = first open', () => {
        const s = state({});
        expect(driver.subSteps(s).map((x) => x.id)).toEqual([
            'accounts',
            'repository',
            'block-libraries',
        ]);
        expect(driver.active(s)).toBe('accounts'); // repository is locked
        expect(driver.next(s)).toBe('repository');
        expect(driver.prev(s)).toBeNull();
    });

    it('includes the Code Sync sub-step only for a NEW repo', () => {
        const s = state({ edsConfig: { repoMode: 'new' } } as Partial<WizardState>);
        expect(driver.subSteps(s).map((x) => x.id)).toEqual([
            'accounts',
            'repository',
            'code-sync',
            'block-libraries',
        ]);
    });

    it('uses the activeStorefrontStep state key for active + setActive', () => {
        expect(driver.active(state({ activeStorefrontStep: 'block-libraries' }))).toBe(
            'block-libraries'
        );
        expect(driver.setActive('repository')).toEqual({ activeStorefrontStep: 'repository' });
    });

    it('gates each required sub-step but lets block-libraries pass', () => {
        expect(driver.isComplete(state({}), 'accounts')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'accounts')).toBe(true);
        expect(driver.isComplete(state({}), 'repository')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'repository')).toBe(true);
        expect(driver.isComplete(state({}), 'code-sync')).toBe(false);
        expect(driver.isComplete(CONFIGURED_STOREFRONT, 'code-sync')).toBe(true);
        expect(driver.isComplete(state({}), 'block-libraries')).toBe(true);
    });

    it('enters at the first OPEN sub-step (or last when atEnd)', () => {
        const fresh = state({}); // accounts is current/open, later required steps locked
        expect(driver.entry(fresh, false)).toEqual({ activeStorefrontStep: 'accounts' });
        expect(driver.entry(fresh, true)).toEqual({ activeStorefrontStep: 'block-libraries' });
    });

    it('has no commit-gating (no-op commit/uncommit)', () => {
        expect(driver.commit(state({}), 'accounts')).toEqual({});
        expect(driver.uncommit(state({}), ['accounts', 'block-libraries'], 'accounts')).toEqual({});
    });
});

describe('integrations driver', () => {
    const driver = areaSubSteps('integrations')!;

    it('is a single "deployables" screen until a deployable is selected', () => {
        // Nothing selected → just Services; nothing to walk.
        const empty = state({});
        expect(driver.subSteps(empty).map((x) => x.id)).toEqual(['deployables']);
        expect(driver.active(empty)).toBe('deployables');
        expect(driver.next(empty)).toBeNull();
        expect(driver.prev(empty)).toBeNull();
    });

    it('adds the "adobe-io" sub-step once a deployable is selected', () => {
        const s = state({
            selectedAppBuilderComponents: ['commerce-paas-mesh'],
            activeIntegrationsStep: 'deployables',
        });
        expect(driver.subSteps(s).map((x) => x.id)).toEqual(['deployables', 'adobe-io']);
        // From Services, Continue walks to Adobe I/O.
        expect(driver.next(s)).toBe('adobe-io');
        expect(driver.prev(s)).toBeNull();
    });

    it('uses the activeIntegrationsStep state key for active + setActive', () => {
        const s = state({
            selectedAppBuilderComponents: ['x'],
            activeIntegrationsStep: 'adobe-io',
        });
        expect(driver.active(s)).toBe('adobe-io');
        expect(driver.setActive('adobe-io')).toEqual({ activeIntegrationsStep: 'adobe-io' });
        expect(driver.prev(s)).toBe('deployables');
        expect(driver.next(s)).toBeNull();
    });

    it('Services is always complete; Adobe I/O gates on project + workspace', () => {
        // Services (deployables) is always valid.
        expect(driver.isComplete(state({}), 'deployables')).toBe(true);
        expect(
            driver.isComplete(state({ selectedAppBuilderComponents: ['x'] }), 'deployables')
        ).toBe(true);
        // Adobe I/O: nothing selected → complete (optional).
        expect(driver.isComplete(state({}), 'adobe-io')).toBe(true);
        // A deployable selected without a full destination → incomplete.
        expect(driver.isComplete(state({ selectedAppBuilderComponents: ['x'] }), 'adobe-io')).toBe(
            false
        );
        // Signed in + project + workspace → complete.
        expect(
            driver.isComplete(
                state({
                    selectedAppBuilderComponents: ['x'],
                    adobeAuth: { isAuthenticated: true, isChecking: false },
                    adobeOrg: { id: 'o', name: 'Acme' },
                    adobeProject: { id: 'p' },
                    adobeWorkspace: { id: 'w' },
                } as unknown as Partial<WizardState>),
                'adobe-io'
            )
        ).toBe(true);
    });

    it('enters at the first-open sub-step', () => {
        // A deployable selected but no destination → Adobe I/O is the first-open sub-step.
        const s = state({
            selectedAppBuilderComponents: ['x'],
            selectedBackend: 'adobe-commerce-accs',
        });
        expect(driver.entry(s, false)).toEqual({ activeIntegrationsStep: 'adobe-io' });
        expect(driver.entry(s, true)).toEqual({ activeIntegrationsStep: 'adobe-io' });
        // Nothing selected → only Services.
        expect(driver.entry(state({}), false)).toEqual({ activeIntegrationsStep: 'deployables' });
    });

    it('commits the PENDING workspace as the adobeWorkspace default on Adobe I/O Continue', () => {
        const pending = { id: 'w-pending', name: 'Stage', title: 'Stage' };
        expect(driver.commit(state({ pendingAdobeWorkspace: pending }), 'adobe-io')).toEqual({
            adobeWorkspace: pending,
            pendingAdobeWorkspace: undefined,
        });
        // Other sub-steps do not commit anything.
        expect(driver.commit(state({ pendingAdobeWorkspace: pending }), 'deployables')).toEqual({});
    });

    it('un-commits the workspace back to pending on Back off Adobe I/O', () => {
        const committed = { id: 'w', name: 'Stage', title: 'Stage' };
        const order = ['deployables', 'adobe-io'];
        expect(driver.uncommit(state({ adobeWorkspace: committed }), order, 'deployables')).toEqual(
            { adobeWorkspace: undefined, pendingAdobeWorkspace: committed }
        );
    });

    describe('retreatWithin (Adobe I/O inner disclosure: project → workspace → summary)', () => {
        const onAdobeIo = {
            selectedAppBuilderComponents: ['x'],
            activeIntegrationsStep: 'adobe-io' as const,
        };

        it('retreats summary → workspace picker (committed becomes pending)', () => {
            const ws = { id: 'w', name: 'Stage', title: 'Stage' };
            const s = state({ ...onAdobeIo, adobeProject: { id: 'p' }, adobeWorkspace: ws });
            expect(driver.retreatWithin!(s)).toEqual({
                adobeWorkspace: undefined,
                pendingAdobeWorkspace: ws,
            });
        });

        it('retreats workspace picker → project selection (project stays highlighted as pending)', () => {
            const project = { id: 'p' };
            const s = state({
                ...onAdobeIo,
                adobeProject: project,
                pendingAdobeWorkspace: { id: 'w', name: 'Stage' },
            });
            expect(driver.retreatWithin!(s)).toEqual({
                adobeProject: undefined,
                pendingAdobeProject: project,
                pendingAdobeWorkspace: undefined,
                workspacesCache: undefined,
            });
        });

        it('returns null on the project view (Back falls through to prev sub-step)', () => {
            expect(driver.retreatWithin!(state(onAdobeIo))).toBeNull();
        });

        it('returns null when the active sub-step is not adobe-io', () => {
            const s = state({
                selectedAppBuilderComponents: ['x'],
                activeIntegrationsStep: 'deployables',
                adobeProject: { id: 'p' },
            });
            expect(driver.retreatWithin!(s)).toBeNull();
        });
    });

    describe('advanceWithin (Continue commits the pending project pick, stays on adobe-io)', () => {
        const onAdobeIo = {
            selectedAppBuilderComponents: ['x'],
            activeIntegrationsStep: 'adobe-io' as const,
        };

        it('commits pendingAdobeProject and clears workspace state (fresh workspace view)', () => {
            const pending = { id: 'p', name: 'My Project' };
            const s = state({ ...onAdobeIo, pendingAdobeProject: pending });
            expect(driver.advanceWithin!(s)).toEqual({
                adobeProject: pending,
                pendingAdobeProject: undefined,
                adobeWorkspace: undefined,
                pendingAdobeWorkspace: undefined,
                workspacesCache: undefined,
            });
        });

        it('returns null once the project is committed (Continue commits workspace/leaves)', () => {
            const s = state({
                ...onAdobeIo,
                adobeProject: { id: 'p' },
                pendingAdobeWorkspace: { id: 'w', name: 'Stage' },
            });
            expect(driver.advanceWithin!(s)).toBeNull();
        });

        it('returns null with no pending pick, and off the adobe-io sub-step', () => {
            expect(driver.advanceWithin!(state(onAdobeIo))).toBeNull();
            const s = state({
                selectedAppBuilderComponents: ['x'],
                activeIntegrationsStep: 'deployables',
                pendingAdobeProject: { id: 'p' },
            });
            expect(driver.advanceWithin!(s)).toBeNull();
        });
    });
});

describe('commerce driver', () => {
    const driver = areaSubSteps('commerce')!;

    it('uses activeCommerceStep + commits via committedCommerceSteps', () => {
        const s = state({ selectedBackend: 'adobe-commerce-paas' });
        expect(driver.subSteps(s).map((x) => x.id)).toEqual([
            'backend',
            'connection',
            'business-structure',
            'catalog',
        ]);
        expect(driver.setActive('connection')).toEqual({ activeCommerceStep: 'connection' });
        expect(driver.commit(s, 'backend')).toEqual({ committedCommerceSteps: ['backend'] });
    });
});
