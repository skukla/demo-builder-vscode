/**
 * useIntegrationFlow — what each kind COMMITS at the finish.
 *
 * The last stage's Continue routes through the unchanged useProjectBuilder
 * handlers: a mesh or a kept-default catalog pick toggles a fixed id, while a
 * renamed catalog pick, a seeded or blank "Build custom", and an imported repo
 * all mint an INSTANCE identity and add it as a custom component. Free API picks
 * ride along under the minted id. Stage order lives in the base suite.
 */

import { act } from '@testing-library/react';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import {
    setupAddFlow as setup,
    pickKindAndContinue,
    BLANK_COMPONENT,
    LATER_ADD,
    type AddFlowSetup as Setup,
} from './useIntegrationFlow.testUtils';

describe('useIntegrationFlow — catalog/custom finish (deterministic, no API picks)', () => {
    /**
     * Walk a signed-in later-add catalog to its terminal stage — which is now
     * source-catalog: a committed destination is a context line, not a step.
     */
    function walkCatalogToTerminal(s: Setup, catalogId = 'erp-sync'): void {
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(catalogId));
        expect(s.result.current.stage).toBe('source-catalog');
    }

    it('finishes a catalog add from the SOURCE stage: adds it and writes NO selectedConsoleApis', () => {
        const s = setup({ initial: LATER_ADD });
        walkCatalogToTerminal(s);
        // source-catalog is terminal for the deterministic catalog — a single Add
        // press commits the component and closes (no dest step, no api-access).
        act(() => s.result.current.onContinue());
        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith('erp-sync', true);
        // API access is deterministic — the add flow never merges per-integration APIs.
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a RENAMED catalog pick commits a named INSTANCE of the entry source (2026-08-27)', () => {
        // The option to name a pre-built: an edited name routes through the
        // same custom-add machinery the blank/seed path uses, carrying the
        // entry's repo — capabilities then survive via source recognition.
        const KIT_ENTRY: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_ENTRY] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT_ENTRY.id));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT_ENTRY.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('control: a KEPT default name (slug = entry id) still commits the catalog identity', () => {
        const KIT_ENTRY: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_ENTRY] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT_ENTRY.id));
        // No label typed: the default (the entry's own name) mints the entry's
        // own id — its id is excluded from its own collision domain.
        act(() => s.result.current.onContinue());

        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(KIT_ENTRY.id, true);
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('source-blank is answerable immediately — Blank is the default, the name optional', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        expect(s.result.current.stage).toBe('source-blank');
        expect(s.result.current.canContinue).toBe(true);
    });

    it('a SEEDED blank finish commits the seed source (not the shell) with the instance identity', () => {
        // The seed model: "Build custom" starting from the starter kit clones the
        // KIT's repo under the user's name; the blank shell is only the default.
        const KIT_SEED: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            layout: 'extension',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_SEED] });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setSeed('commerce-integration-starter-kit'));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add → commit + close

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT_SEED.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('clearing the seed returns the commit to the blank shell', () => {
        const KIT_SEED: AppBuilderComponentCatalogEntry = {
            id: 'commerce-integration-starter-kit',
            name: 'Commerce Integration Starter Kit',
            description: 'The kit',
            kind: 'integration',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
        };
        const s = setup({ initial: LATER_ADD, catalog: [KIT_SEED] });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setSeed('commerce-integration-starter-kit'));
        act(() => s.result.current.setSeed(undefined));
        act(() => s.result.current.setLabel('My App'));
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'my-app', name: 'My App' }
        );
    });

    it('a blank finish commits the INSTANCE id (not app-builder-shell) with picks keyed under it', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Firefly Image Gen'));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add → commit + close
        // The shell repo is a TEMPLATE: the commit routes through the custom add with
        // the instance identity — never the fixed-id toggle (which capped at one).
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'firefly-image-gen', name: 'Firefly Image Gen' }
        );
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { 'firefly-image-gen': ['FireflyServicesSDK'] },
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a blank finish with no picks writes no selectedConsoleApis', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'order-sync', name: 'Order Sync' }
        );
        expect(s.updateState).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a custom (import) finish mints the repo-named instance; picks key under it', () => {
        // Optional-name model: the import defaults to the REPO's name (the
        // label field's placeholder), and picks key under the minted id.
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.onContinue()); // → api-access (no dest step)
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add → commit + close
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            { owner: 'acme', repo: 'widget' },
            { id: 'widget', name: 'widget' }
        );
        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: { widget: ['FireflyServicesSDK'] },
        });
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('a custom (import) finish honors a typed name', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());
        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            { owner: 'acme', repo: 'widget' },
            { id: 'order-sync', name: 'Order Sync' }
        );
    });

    it('clears the draft source when setCustomSource receives undefined (cleared/invalid URL)', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        expect(s.result.current.canContinue).toBe(true);

        act(() => s.result.current.setCustomSource(undefined));

        expect(s.result.current.draft.customSource).toBeUndefined();
        expect(s.result.current.canContinue).toBe(false);
    });
});

/**
 * Which entry, which template, which name — the four decisions the finish makes
 * before it calls a builder handler. Each is asserted through the ARGUMENTS the
 * handler receives, because a builder stub answers the same whatever it is handed.
 */
describe('useIntegrationFlow — finish: picking the right entry, template and name', () => {
    const FIRST: AppBuilderComponentCatalogEntry = {
        id: 'aaa-first-entry',
        name: 'First Entry',
        description: 'Sorts first; never the one the test picks',
        kind: 'integration',
        source: { owner: 'adobe', repo: 'first-entry', branch: 'main' },
    };
    const KIT: AppBuilderComponentCatalogEntry = {
        id: 'commerce-integration-starter-kit',
        name: 'Commerce Integration Starter Kit',
        description: 'The kit',
        kind: 'integration',
        source: { owner: 'adobe', repo: 'commerce-integration-starter-kit', branch: 'main' },
    };

    it('a renamed catalog pick commits the PICKED entry’s source, not the first in the catalog', () => {
        const s = setup({ initial: LATER_ADD, catalog: [FIRST, KIT] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT.id));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
    });

    it('a seeded blank commits the PICKED seed’s source, not the first in the catalog', () => {
        const s = setup({ initial: LATER_ADD, catalog: [FIRST, KIT] });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setSeed(KIT.id));
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(KIT.source, {
            id: 'order-sync',
            name: 'Order Sync',
        });
    });

    // buildReservedIds puts every catalog id in the domain, so the entry's own id is
    // ALWAYS reserved by the time a real flow mints against it. Excluding it is what
    // keeps a kept default resolving to the catalog identity instead of "-2".
    it('a kept default name still mints the entry id when that id is itself reserved', () => {
        const s = setup({
            initial: LATER_ADD,
            catalog: [KIT],
            reservedIds: new Set(['app-builder-shell', KIT.id]),
        });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT.id));
        act(() => s.result.current.onContinue());

        expect(s.builder.onAppBuilderComponentToggle).toHaveBeenCalledWith(KIT.id, true);
        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('an unnamed blank mints the default Custom Integration identity', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'custom-integration', name: 'Custom Integration' }
        );
    });

    it('a whitespace-only name is not a name — it falls back to the same default', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('   '));
        act(() => s.result.current.onContinue());
        act(() => s.result.current.onContinue());

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'custom-integration', name: 'Custom Integration' }
        );
    });

    it('a kind changed back to Build custom ignores the catalog id left in the draft', () => {
        const s = setup({ initial: LATER_ADD, catalog: [KIT] });
        pickKindAndContinue(s, 'catalog');
        act(() => s.result.current.pickCatalog(KIT.id));
        act(() => s.result.current.onBack());
        act(() => s.result.current.pickKind('blank'));
        act(() => s.result.current.onContinue()); // → source-blank
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add

        expect(s.builder.onAddCustomAppBuilderComponent).toHaveBeenCalledWith(
            BLANK_COMPONENT.source,
            { id: 'order-sync', name: 'Order Sync' }
        );
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
    });
});

describe('useIntegrationFlow — finish: nothing to commit', () => {
    it('merges the picks into the console APIs already recorded for other integrations', () => {
        const s = setup({
            initial: {
                ...LATER_ADD,
                selectedConsoleApis: { 'existing-integration': ['AdobeIOManagementAPI'] },
            },
        });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.toggleApi('FireflyServicesSDK'));
        act(() => s.result.current.onContinue()); // Add

        expect(s.updateState).toHaveBeenCalledWith({
            selectedConsoleApis: {
                'existing-integration': ['AdobeIOManagementAPI'],
                'order-sync': ['FireflyServicesSDK'],
            },
        });
    });

    it('a blank finish on a stack that ships no starter app commits nothing and closes', () => {
        const s = setup({ initial: LATER_ADD, blankComponent: null });
        pickKindAndContinue(s, 'blank');
        act(() => s.result.current.setLabel('Order Sync'));
        act(() => s.result.current.onContinue()); // → api-access
        act(() => s.result.current.onContinue()); // Add

        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.builder.onAppBuilderComponentToggle).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });

    it('an import whose URL was cleared after the source stage commits nothing and closes', () => {
        const s = setup({ initial: LATER_ADD });
        pickKindAndContinue(s, 'custom');
        act(() => s.result.current.setCustomSource({ owner: 'acme', repo: 'widget' }));
        act(() => s.result.current.onContinue()); // → api-access
        expect(s.result.current.stage).toBe('api-access');

        act(() => s.result.current.setCustomSource(undefined));
        act(() => s.result.current.onContinue()); // Add

        expect(s.builder.onAddCustomAppBuilderComponent).not.toHaveBeenCalled();
        expect(s.onClose).toHaveBeenCalledTimes(1);
    });
});
