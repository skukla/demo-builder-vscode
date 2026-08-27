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
const API_EDIT: FlowMode = 'api-edit';

describe('deriveStageOrder — add mode', () => {
    it('mesh, signed in, destination uncommitted → kind + full dest, NO api-access (deterministic APIs)', () => {
        expect(deriveStageOrder(draft({ kind: 'mesh' }), slice(), ADD)).toEqual([
            'kind',
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('mesh, signed out, uncommitted → inserts dest-signin, still no api-access', () => {
        expect(
            deriveStageOrder(draft({ kind: 'mesh' }), slice({ isSignedIn: false }), ADD)
        ).toEqual(['kind', 'dest-signin', 'dest-project', 'dest-workspace']);
    });

    it('mesh, destination committed (later add) → dest vanishes entirely, no api-access', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'mesh' }),
                slice({ destinationCommitted: true, selectedIds: ['existing-integration'] }),
                ADD
            )
        ).toEqual(['kind']);
    });

    it('catalog, signed in, uncommitted → source-catalog + full dest, NO api-access (deterministic APIs)', () => {
        expect(deriveStageOrder(draft({ kind: 'catalog' }), slice(), ADD)).toEqual([
            'kind',
            'source-catalog',
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('catalog, signed out, uncommitted → dest-signin included, still no api-access', () => {
        expect(
            deriveStageOrder(draft({ kind: 'catalog' }), slice({ isSignedIn: false }), ADD)
        ).toEqual(['kind', 'source-catalog', 'dest-signin', 'dest-project', 'dest-workspace']);
    });

    it('catalog, destination committed → the SOURCE stage is terminal (no dest, no api-access)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'catalog' }),
                slice({ destinationCommitted: true, selectedIds: ['existing-integration'] }),
                ADD
            )
        ).toEqual(['kind', 'source-catalog']);
    });

    it('custom, signed in, uncommitted → source-custom + full dest + api-access (interactive picker)', () => {
        expect(deriveStageOrder(draft({ kind: 'custom' }), slice(), ADD)).toEqual([
            'kind',
            'source-custom',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('blank, signed in, uncommitted → source-blank + full dest + api-access', () => {
        expect(deriveStageOrder(draft({ kind: 'blank' }), slice(), ADD)).toEqual([
            'kind',
            'source-blank',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('blank, signed out, uncommitted → source-blank + dest-signin + full dest + api-access', () => {
        expect(
            deriveStageOrder(draft({ kind: 'blank' }), slice({ isSignedIn: false }), ADD)
        ).toEqual([
            'kind',
            'source-blank',
            'dest-signin',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('blank, destination committed (later add) → source-blank + api-access (no dest step)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'blank' }),
                slice({ destinationCommitted: true, selectedIds: ['existing-integration'] }),
                ADD
            )
        ).toEqual(['kind', 'source-blank', 'api-access']);
    });

    it('custom, destination committed (later add) → api-access only (no dest step)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'custom' }),
                slice({ destinationCommitted: true, selectedIds: ['existing-integration'] }),
                ADD
            )
        ).toEqual(['kind', 'source-custom', 'api-access']);
    });

    it('destination committed but zero integrations → walks the picker (clean slate), not the summary', () => {
        // After removing the last integration, the shared Adobe project/workspace stays
        // committed but no integration references it. The next Add re-walks the picker so
        // the user re-confirms a destination instead of silently reusing the old one.
        expect(
            deriveStageOrder(
                draft({ kind: 'custom' }),
                slice({ destinationCommitted: true, selectedIds: [], meshSelected: false }),
                ADD
            )
        ).toEqual(['kind', 'source-custom', 'dest-project', 'dest-workspace', 'api-access']);
    });

    it('destination committed, a selected mesh references it (no App Builder rows) → collapses', () => {
        // The slice models a mesh reference through meshSelected (isMeshSelected
        // over selectedAppBuilderComponents) independently of selectedIds.
        // Adding the first App Builder integration should still collapse to the summary,
        // not re-walk the picker (the destination is genuinely referenced).
        expect(
            deriveStageOrder(
                draft({ kind: 'custom' }),
                slice({ destinationCommitted: true, selectedIds: [], meshSelected: true }),
                ADD
            )
        ).toEqual(['kind', 'source-custom', 'api-access']);
    });

    it('signed out → sign-in stage required even when the destination is committed', () => {
        // Edit mode: the persisted project/workspace make destinationCommitted true, but
        // without a live Adobe session the api-access picker can't list org APIs. The
        // summary must NOT be shown; the flow walks the destination stages (sign-in first)
        // so the user signs in before reaching api-access.
        expect(
            deriveStageOrder(
                draft({ kind: 'custom' }),
                slice({ isSignedIn: false, destinationCommitted: true }),
                ADD
            )
        ).toEqual([
            'kind',
            'source-custom',
            'dest-signin',
            'dest-project',
            'dest-workspace',
            'api-access',
        ]);
    });

    it('no kind picked yet → kind + generic dest tail, NO api-access (only custom/blank get it)', () => {
        expect(deriveStageOrder(draft(), slice(), ADD)).toEqual([
            'kind',
            'dest-project',
            'dest-workspace',
        ]);
    });

    it('changingDestination re-expands a committed destination to full dest stages (catalog: no api-access)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'catalog', changingDestination: true }),
                slice({ destinationCommitted: true }),
                ADD
            )
        ).toEqual(['kind', 'source-catalog', 'dest-project', 'dest-workspace']);
    });

    it('changingDestination while signed out also re-adds dest-signin (catalog: no api-access)', () => {
        expect(
            deriveStageOrder(
                draft({ kind: 'catalog', changingDestination: true }),
                slice({ destinationCommitted: true, isSignedIn: false }),
                ADD
            )
        ).toEqual(['kind', 'source-catalog', 'dest-signin', 'dest-project', 'dest-workspace']);
    });
});

describe('deriveStageOrder — api-edit mode', () => {
    it('yields just the api-access picker (re-editing an existing integration)', () => {
        expect(deriveStageOrder(draft({ kind: 'custom' }), slice(), API_EDIT)).toEqual([
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

    it('catalog dest-workspace → null (terminal — deterministic kinds have no api-access)', () => {
        expect(nextStage('dest-workspace', draft({ kind: 'catalog' }), slice(), ADD)).toBeNull();
    });

    it('mesh dest-workspace → null (terminal — no api-access)', () => {
        expect(nextStage('dest-workspace', draft({ kind: 'mesh' }), slice(), ADD)).toBeNull();
    });

    it('custom dest-workspace → api-access (interactive picker kept)', () => {
        expect(nextStage('dest-workspace', draft({ kind: 'custom' }), slice(), ADD)).toBe(
            'api-access'
        );
    });

    it('custom last stage (api-access) → null (Finish)', () => {
        expect(nextStage('api-access', draft({ kind: 'custom' }), slice(), ADD)).toBeNull();
    });

    it('destination mode last stage → null', () => {
        expect(nextStage('dest-workspace', draft(), slice(), DEST)).toBeNull();
    });

    it('kind → source-blank for a blank draft', () => {
        expect(nextStage('kind', draft({ kind: 'blank' }), slice(), ADD)).toBe('source-blank');
    });

    it('source-blank → dest-project when signed in', () => {
        expect(nextStage('source-blank', draft({ kind: 'blank' }), slice(), ADD)).toBe(
            'dest-project'
        );
    });

    it('vanished dest-signin (blank kind, signed in mid-flow) clamps across source-blank to dest-project', () => {
        // Predecessor walk crosses the new canonical source-blank slot.
        expect(nextStage('dest-signin', draft({ kind: 'blank' }), slice(), ADD)).toBe(
            'dest-project'
        );
    });

    it('vanished source-custom (kind switched to blank) clamps to dest-project via source-blank', () => {
        expect(nextStage('source-custom', draft({ kind: 'blank' }), slice(), ADD)).toBe(
            'dest-project'
        );
    });

    it('vanished source-blank (kind switched to catalog) clamps via source-catalog', () => {
        expect(
            nextStage('source-blank', draft({ kind: 'catalog', catalogId: 'c1' }), slice(), ADD)
        ).toBe('dest-project');
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

    it('signing in mid-flow on a committed destination clamps dest-signin onto api-access', () => {
        // The signed-out edit flow starts at dest-signin (committed but no session).
        // After sign-in the destination stages vanish (it shows as a context line), so
        // the stored dest-signin clamps forward onto the next surviving stage.
        expect(
            nextStage(
                'dest-signin',
                draft({ kind: 'custom' }),
                slice({
                    isSignedIn: true,
                    destinationCommitted: true,
                    selectedIds: ['existing-integration'],
                }),
                ADD
            )
        ).toBe('api-access');
    });

    it('vanished dest-project leaves the flow TERMINAL (nothing survives after it)', () => {
        expect(
            nextStage(
                'dest-project',
                draft({ kind: 'catalog' }),
                slice({ destinationCommitted: true, selectedIds: ['existing-integration'] }),
                ADD
            )
            // catalog has no api-access and the destination is now a context line, so
            // source-catalog is the last stage standing — null means "commit next".
        ).toBeNull();
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

    it('source-blank → kind', () => {
        expect(prevStage('source-blank', draft({ kind: 'blank' }), slice(), ADD)).toBe('kind');
    });

    it('dest-project → source-blank for a blank draft when signed in', () => {
        expect(prevStage('dest-project', draft({ kind: 'blank' }), slice(), ADD)).toBe(
            'source-blank'
        );
    });

    it('vanished dest-signin (blank kind) → source-blank as the surviving predecessor', () => {
        expect(prevStage('dest-signin', draft({ kind: 'blank' }), slice(), ADD)).toBe(
            'source-blank'
        );
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

    it('source-catalog blocks until a catalogId AND a valid name are present', () => {
        expect(canContinue('source-catalog', draft({ kind: 'catalog' }), slice())).toBe(false);
        // A pick alone no longer continues: the stage prefills + emits the
        // name instantly, so this gate only holds while an EDIT is invalid.
        expect(
            canContinue('source-catalog', draft({ kind: 'catalog', catalogId: 'c1' }), slice())
        ).toBe(false);
        expect(
            canContinue(
                'source-catalog',
                draft({ kind: 'catalog', catalogId: 'c1', instance: { id: 'c1', name: 'C One' } }),
                slice()
            )
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

    it('source-blank blocks until a valid instance is set', () => {
        expect(canContinue('source-blank', draft({ kind: 'blank' }), slice())).toBe(false);
    });

    it('source-blank passes once the draft carries an instance', () => {
        const d = draft({ kind: 'blank', instance: { id: 'order-sync', name: 'Order Sync' } });
        expect(canContinue('source-blank', d, slice())).toBe(true);
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
    ];
    const meshOrder: FlowStageId[] = ['kind', 'dest-project', 'dest-workspace'];
    const customOrder: FlowStageId[] = [
        'kind',
        'source-custom',
        'dest-project',
        'dest-workspace',
        'api-access',
    ];
    const destOrder: FlowStageId[] = ['dest-project', 'dest-workspace'];

    it('catalog terminal (dest-workspace) in add mode → "Add Integration"', () => {
        expect(continueLabel('dest-workspace', catalogOrder, ADD)).toBe('Add Integration');
    });

    it('mesh terminal (dest-workspace) in add mode → "Add Integration"', () => {
        expect(continueLabel('dest-workspace', meshOrder, ADD)).toBe('Add Integration');
    });

    it('custom terminal (api-access) in add mode → "Add Integration"; earlier stages mid-walk', () => {
        expect(continueLabel('api-access', customOrder, ADD)).toBe('Add Integration');
        expect(continueLabel('dest-workspace', customOrder, ADD)).toBe('Continue');
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

// The Add Integration modal spent four fix attempts ignoring every width and height
// it was given because its DialogContainer carried type="fullscreen": that renders
// spectrum-Modal--fullscreen / spectrum-Dialog--fullscreen, which size to the VIEWPORT
// and outrank the Dialog's own `size`. It was the only fullscreen container in the
// repo, which is why every other modal already hugged its content (2026-07-31).
describe('AddIntegrationFlowModal container type', () => {
    it('does NOT use a fullscreen DialogContainer', () => {
        const source = require('fs').readFileSync(
            require('path').join(
                __dirname,
                '../../../../../../src/features/project-creation/ui/components/integration-flow/AddIntegrationFlowModal.tsx'
            ),
            'utf8'
        );
        const container = source.match(/<DialogContainer[^>]*>/);

        expect(container).not.toBeNull();
        expect(container?.[0]).not.toMatch(/type=/);
    });
});
