/**
 * flowStages tests (Integrations flow redesign — Step 1)
 *
 * Pure stage machine for the Add Integration modal journey: stage-order
 * derivation per kind/mode (first-add vs later-add, signed-in vs signed-out,
 * changingDestination re-expansion), next/prev walks including the
 * vanished-stage clamp, per-stage canContinue gates (dup guard, phaseRunning),
 * footer labels for both modes, and the mesh kind-picker availability
 * predicate. No React, no wizard-state writes.
 */

import {
    deriveStageOrder,
    nextStage,
    prevStage,
    canContinue,
    continueLabel,
    meshKindOffered,
    type FlowDraft,
    type FlowStateSlice,
    type FlowMode,
    type FlowStageId,
} from '@/features/project-creation/ui/components/integration-flow/flowStages';

function draft(overrides: Partial<FlowDraft> = {}): FlowDraft {
    return {
        changingDestination: false,
        ...overrides,
    };
}

function slice(overrides: Partial<FlowStateSlice> = {}): FlowStateSlice {
    return {
        isSignedIn: true,
        destinationCommitted: false,
        projectCommitted: false,
        workspaceCommitted: false,
        phaseRunning: false,
        selectedIds: [],
        meshAvailable: true,
        meshSelected: false,
        ...overrides,
    };
}

const ADD: FlowMode = 'add';
const DEST: FlowMode = 'destination';

describe('deriveStageOrder — add mode', () => {
    it('mesh, signed in, destination uncommitted → kind + full dest + api-access (enable runs in-modal)', () => {
        expect(deriveStageOrder(draft({ kind: 'mesh' }), slice(), ADD)).toEqual([
            'kind',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('mesh, signed out, uncommitted → inserts dest-signin before dest-project', () => {
        expect(
            deriveStageOrder(draft({ kind: 'mesh' }), slice({ isSignedIn: false }), ADD)
        ).toEqual(['kind', 'dest-signin', 'dest-project', 'dest-workspace', 'api-access']);
    });

    it('mesh, destination committed (later add) → dest collapses to dest-summary + api-access', () => {
        expect(
            deriveStageOrder(draft({ kind: 'mesh' }), slice({ destinationCommitted: true }), ADD)
        ).toEqual(['kind', 'dest-summary', 'api-access']);
    });

    it('catalog, signed in, uncommitted → source-catalog + full dest + api-access', () => {
        expect(deriveStageOrder(draft({ kind: 'catalog' }), slice(), ADD)).toEqual([
            'kind',
            'source-catalog',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('catalog, signed out, uncommitted → dest-signin included', () => {
        expect(
            deriveStageOrder(draft({ kind: 'catalog' }), slice({ isSignedIn: false }), ADD)
        ).toEqual([
            'kind',
            'source-catalog',
            'dest-signin',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('catalog, destination committed → dest-summary between source and apis', () => {
        expect(
            deriveStageOrder(draft({ kind: 'catalog' }), slice({ destinationCommitted: true }), ADD)
        ).toEqual(['kind', 'source-catalog', 'dest-summary', 'api-access']);
    });

    it('custom, signed in, uncommitted → source-custom + full dest + api-access', () => {
        expect(deriveStageOrder(draft({ kind: 'custom' }), slice(), ADD)).toEqual([
            'kind',
            'source-custom',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('custom, destination committed → dest-summary', () => {
        expect(
            deriveStageOrder(draft({ kind: 'custom' }), slice({ destinationCommitted: true }), ADD)
        ).toEqual(['kind', 'source-custom', 'dest-summary', 'api-access']);
    });

    it('committed destination wins over signed-out (summary shown, no sign-in stage)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'custom' }),
                slice({ isSignedIn: false, destinationCommitted: true }),
                ADD
            )
        ).toEqual(['kind', 'source-custom', 'dest-summary', 'api-access']);
    });

    it('no kind picked yet → kind + generic tail (no source stage)', () => {
        expect(deriveStageOrder(draft(), slice(), ADD)).toEqual([
            'kind',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('changingDestination re-expands a committed destination to full dest stages', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'catalog', changingDestination: true }),
                slice({ destinationCommitted: true }),
                ADD
            )
        ).toEqual(['kind', 'source-catalog', 'dest-project', 'dest-workspace', 'api-access']);
    });

    it('changingDestination while signed out also re-adds dest-signin', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'catalog', changingDestination: true }),
                slice({ destinationCommitted: true, isSignedIn: false }),
                ADD
            )
        ).toEqual([
            'kind',
            'source-catalog',
            'dest-signin',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });
});

describe('deriveStageOrder — destination mode', () => {
    it('signed in → project + workspace only', () => {
        expect(deriveStageOrder(draft(), slice(), DEST)).toEqual([
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('signed out → sign-in first (pre-seeded mesh "Set up" path)', () => {
        expect(deriveStageOrder(draft(), slice({ isSignedIn: false }), DEST)).toEqual([
            'dest-signin',
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('ignores destinationCommitted (Change on a configured row still re-picks)', () => {
        expect(deriveStageOrder(draft(), slice({ destinationCommitted: true }), DEST)).toEqual([
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('ignores draft kind — never includes kind/source/api stages', () => {
        expect(deriveStageOrder(draft({ kind: 'catalog', catalogId: 'x' }), slice(), DEST)).toEqual(
            ['dest-project', 'dest-workspace']
        );
    });
});

describe('nextStage', () => {
    it('kind → source-catalog for a catalog draft', () => {
        expect(nextStage('kind', draft({ kind: 'catalog' }), slice(), ADD)).toBe('source-catalog');
    });

    it('source-catalog → dest-project when signed in', () => {
        expect(nextStage('source-catalog', draft({ kind: 'catalog' }), slice(), ADD)).toBe(
            'dest-project'
        );
    });

    it('dest-workspace → api-access for catalog', () => {
        expect(nextStage('dest-workspace', draft({ kind: 'catalog' }), slice(), ADD)).toBe(
            'api-access'
        );
    });

    it('last stage (api-access) → null (Finish)', () => {
        expect(nextStage('api-access', draft({ kind: 'catalog' }), slice(), ADD)).toBeNull();
    });

    it('mesh dest-workspace → api-access (the in-modal enable stage)', () => {
        expect(nextStage('dest-workspace', draft({ kind: 'mesh' }), slice(), ADD)).toBe(
            'api-access'
        );
    });

    it('mesh last stage (api-access) → null', () => {
        expect(nextStage('api-access', draft({ kind: 'mesh' }), slice(), ADD)).toBeNull();
    });

    it('destination mode last stage → null', () => {
        expect(nextStage('dest-workspace', draft(), slice(), DEST)).toBeNull();
    });

    it('vanished dest-signin (signed in mid-flow) clamps to dest-project (add mode)', () => {
        // Order no longer contains dest-signin; the nearest surviving canonical
        // predecessor is source-catalog, so next is the stage after it.
        expect(nextStage('dest-signin', draft({ kind: 'catalog' }), slice(), ADD)).toBe(
            'dest-project'
        );
    });

    it('vanished dest-signin in destination mode clamps to the first stage', () => {
        expect(nextStage('dest-signin', draft(), slice(), DEST)).toBe('dest-project');
    });

    it('vanished dest-project (dest collapsed to summary) clamps to dest-summary', () => {
        expect(
            nextStage(
                'dest-project',
                draft({ kind: 'catalog' }),
                slice({ destinationCommitted: true }),
                ADD
            )
        ).toBe('dest-summary');
    });
});

describe('prevStage', () => {
    it('first stage (kind) → null', () => {
        expect(prevStage('kind', draft({ kind: 'catalog' }), slice(), ADD)).toBeNull();
    });

    it('source-catalog → kind', () => {
        expect(prevStage('source-catalog', draft({ kind: 'catalog' }), slice(), ADD)).toBe('kind');
    });

    it('dest-project → source-catalog when signed in', () => {
        expect(prevStage('dest-project', draft({ kind: 'catalog' }), slice(), ADD)).toBe(
            'source-catalog'
        );
    });

    it('dest-project → dest-signin when signed out', () => {
        expect(
            prevStage('dest-project', draft({ kind: 'catalog' }), slice({ isSignedIn: false }), ADD)
        ).toBe('dest-signin');
    });

    it('destination mode first stage (dest-project, signed in) → null', () => {
        expect(prevStage('dest-project', draft(), slice(), DEST)).toBeNull();
    });

    it('vanished dest-signin → the surviving canonical predecessor itself', () => {
        expect(prevStage('dest-signin', draft({ kind: 'catalog' }), slice(), ADD)).toBe(
            'source-catalog'
        );
    });

    it('vanished stage with no surviving predecessor → null (destination mode)', () => {
        expect(prevStage('dest-signin', draft(), slice(), DEST)).toBeNull();
    });
});

describe('canContinue', () => {
    it('kind blocks until a kind is picked', () => {
        expect(canContinue('kind', draft(), slice())).toBe(false);
        expect(canContinue('kind', draft({ kind: 'mesh' }), slice())).toBe(true);
    });

    it('source-catalog blocks until a catalogId is picked', () => {
        expect(canContinue('source-catalog', draft({ kind: 'catalog' }), slice())).toBe(false);
        expect(
            canContinue('source-catalog', draft({ kind: 'catalog', catalogId: 'c1' }), slice())
        ).toBe(true);
    });

    it('source-custom blocks without a parsed customSource', () => {
        expect(canContinue('source-custom', draft({ kind: 'custom' }), slice())).toBe(false);
    });

    it('source-custom passes with a non-duplicate customSource', () => {
        const d = draft({ kind: 'custom', customSource: { owner: 'acme', repo: 'app' } });
        expect(canContinue('source-custom', d, slice())).toBe(true);
    });

    it('source-custom dup guard: owner-repo already selected → blocked', () => {
        const d = draft({ kind: 'custom', customSource: { owner: 'acme', repo: 'app' } });
        expect(canContinue('source-custom', d, slice({ selectedIds: ['acme-app'] }))).toBe(false);
    });

    it('dest-signin mirrors isSignedIn', () => {
        expect(canContinue('dest-signin', draft(), slice({ isSignedIn: false }))).toBe(false);
        expect(canContinue('dest-signin', draft(), slice({ isSignedIn: true }))).toBe(true);
    });

    it('dest-project blocks with neither a pending pick nor a committed project', () => {
        expect(canContinue('dest-project', draft(), slice())).toBe(false);
    });

    it('dest-project passes with a pending project pick', () => {
        const d = draft({ pendingProject: { id: 'p1', name: 'Proj' } });
        expect(canContinue('dest-project', d, slice())).toBe(true);
    });

    it('dest-project passes with an already-committed project', () => {
        expect(canContinue('dest-project', draft(), slice({ projectCommitted: true }))).toBe(true);
    });

    it('dest-project blocks while a phase is running even with a pending pick', () => {
        const d = draft({ pendingProject: { id: 'p1', name: 'Proj' } });
        expect(canContinue('dest-project', d, slice({ phaseRunning: true }))).toBe(false);
    });

    it('dest-workspace blocks with neither pending nor committed workspace', () => {
        expect(canContinue('dest-workspace', draft(), slice())).toBe(false);
    });

    it('dest-workspace passes with a pending workspace or a committed one', () => {
        const d = draft({ pendingWorkspace: { id: 'w1', name: 'Stage' } });
        expect(canContinue('dest-workspace', d, slice())).toBe(true);
        expect(canContinue('dest-workspace', draft(), slice({ workspaceCommitted: true }))).toBe(
            true
        );
    });

    it('dest-workspace blocks while a phase is running', () => {
        const d = draft({ pendingWorkspace: { id: 'w1', name: 'Stage' } });
        expect(canContinue('dest-workspace', d, slice({ phaseRunning: true }))).toBe(false);
    });

    it('dest-summary is always continuable', () => {
        expect(canContinue('dest-summary', draft(), slice())).toBe(true);
    });

    it('api-access is informational — never blocks (nothing to select or provision)', () => {
        expect(canContinue('api-access', draft(), slice())).toBe(true);
        // No provisioning happens here anymore, so an in-flight phase elsewhere
        // doesn't gate this step either.
        expect(canContinue('api-access', draft(), slice({ phaseRunning: true }))).toBe(true);
    });
});

describe('continueLabel', () => {
    const catalogOrder: FlowStageId[] = [
        'kind',
        'source-catalog',
        'dest-project',
        'dest-workspace',
        'api-access',
    ];
    const meshOrder: FlowStageId[] = ['kind', 'dest-project', 'dest-workspace', 'api-access'];
    const destOrder: FlowStageId[] = ['dest-project', 'dest-workspace'];

    it('last stage in add mode → "Add Integration"', () => {
        expect(continueLabel('api-access', catalogOrder, ADD)).toBe('Add Integration');
    });

    it('mesh last stage (api-access) in add mode → "Add Integration"; dest-workspace is now mid-walk', () => {
        expect(continueLabel('api-access', meshOrder, ADD)).toBe('Add Integration');
        expect(continueLabel('dest-workspace', meshOrder, ADD)).toBe('Continue');
    });

    it('last stage in destination mode → "Save"', () => {
        expect(continueLabel('dest-workspace', destOrder, DEST)).toBe('Save');
    });

    it('non-last stages → "Continue" in both modes', () => {
        expect(continueLabel('kind', catalogOrder, ADD)).toBe('Continue');
        expect(continueLabel('dest-project', catalogOrder, ADD)).toBe('Continue');
        expect(continueLabel('dest-project', destOrder, DEST)).toBe('Continue');
    });
});

describe('meshKindOffered', () => {
    it('offered when mesh is available and not already selected', () => {
        expect(meshKindOffered(slice())).toBe(true);
    });

    it('hidden when mesh is already selected (either key, incl. package-seeded)', () => {
        expect(meshKindOffered(slice({ meshSelected: true }))).toBe(false);
    });

    it('hidden when the stack does not support mesh', () => {
        expect(meshKindOffered(slice({ meshAvailable: false }))).toBe(false);
    });
});
