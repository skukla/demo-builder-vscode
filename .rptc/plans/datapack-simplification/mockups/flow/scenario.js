/*
 * The scripted extension host for proto.html: what the Datapacks screen's requests get back, and
 * what the host pushes while a job or a clearing runs. Every answer's DATA comes from
 * SCENARIO_DATA, built from scenarioData.ts, which is typed against the extension's own
 * interfaces; this file only decides which answer, when, and in what order.
 *
 * Rebuild the data after editing scenarioData.ts (from the repo root):
 *   npx tsc --noEmit -p .rptc/plans/datapack-simplification/mockups/flow/tsconfig.json
 *   npx esbuild .rptc/plans/datapack-simplification/mockups/flow/scenarioData.ts --bundle \
 *     --format=iife --global-name=SCENARIO_DATA --alias:@=./src --outfile=<served dir>/scenarioData.js
 *
 * Order of events, read from the host handlers:
 *   Install: validate-datapack-import (dry run) -> start-datapack-import answers {activationId}
 *     -> the watcher pushes 'datapack-import-progress' each poll and get-datapack-import-status
 *     answers the stored record -> at the end 'datapack-list-changed'.
 *   Uninstall: get-datapack-removal-changes -> reset-datapack {confirm:true} -> the same watch.
 *   Clear Demo Data: check-demo-data {stores: []} for the choices, then per tick for the preview
 *     -> 'clear-demo-data' (a plain message) -> 'operationProgress' pushes -> its last one.
 *   Add from File: open-datapack-zip (the picker) -> load-datapack-zip -> delete-library-datapack per line.
 *   Pack setup step: get-datapack-setup-step with the flyout; check-datapack-setup-step per Check
 *     (the first Check finds it not done, the next finds it done).
 */
(() => {
    const D = window.SCENARIO_DATA;
    const FRAME_MS = 450;
    const ok = (data) => ({ success: true, data });

    const state = {
        target: D.TARGET_HOLDING,
        installedPack: D.PACKS[0],
        installedAt: D.INSTALLED_AT,
        record: null,
        lastPreview: null,
        jobSeq: 0,
        /** What the last Check of the pack's Admin step found: the first Check fails, the next passes. */
        rootChecked: undefined,
    };

    const packOf = (name, version) => D.PACKS.find((p) => p.id.name === name && (!version || p.id.version === version));
    const outcome = () => window.__OUTCOME__();

    /** The pack's Admin step, only on the pack the project holds and only when the pill shows it. */
    function setupStep(p, checked) {
        const held = state.target.datapack;
        const mine = held && held.name === p.datapackName && held.version === p.version;
        return mine && outcome().setup === 'open' ? D.rootSetupStep(p.datapackName, p.version, checked) : D.NO_SETUP_STEP(p.datapackName, p.version);
    }

    /** Play a job's frames: store each record as the host would, and push its progress. */
    function playJob(frames, onEnd) {
        frames.forEach((frame, i) => {
            setTimeout(() => {
                state.record = frame.record;
                window.__PUSH__(D.IMPORT_PROGRESS_MESSAGE, frame.push);
                if (i === frames.length - 1 && onEnd) onEnd(frame.record);
            }, FRAME_MS * (i + 1));
        });
    }

    function startImport(p) {
        const pack = packOf(p.datapackName, p.version);
        if (!pack) return { success: false, error: `${p.datapackName} ${p.version} is not in the catalog.` };
        const activationId = `db-proto-${++state.jobSeq}`;
        const heldId = state.target.datapack;
        const replaces = heldId && !(heldId.name === pack.id.name && heldId.version === pack.id.version);
        const heldPack = replaces ? packOf(heldId.name, heldId.version) : undefined;
        const frames = D.installFrames({
            activationId,
            pack,
            dataTypes: p.dataTypes && p.dataTypes.length ? p.dataTypes : pack.dataTypes,
            held: replaces ? { name: heldId.name, version: heldId.version, displayName: state.target.heldName || (heldPack && heldPack.displayName) || heldId.name } : undefined,
            fails: outcome().install === 'install-fails',
        });
        // The record exists the moment the job is accepted: useJobPickup reads it straight away.
        state.record = frames[0].record;
        playJob(frames.slice(1), (last) => {
            if (last.outcome === 'success') {
                state.target = D.targetHolding(pack);
                state.installedPack = pack;
                state.installedAt = new Date().toISOString();
            }
            window.__PUSH__(D.DATAPACK_LIST_CHANGED_MESSAGE, {});
        });
        return ok({ activationId });
    }

    function startReset(p) {
        if (!p.confirm) return { success: false, error: 'Uninstalling needs confirm:true.' };
        const pack = packOf(p.datapackName, p.version);
        if (!pack) return { success: false, error: `${p.datapackName} ${p.version} is not in the catalog.` };
        const activationId = `db-proto-${++state.jobSeq}`;
        const frames = D.resetFrames({ activationId, pack, dataTypes: pack.dataTypes });
        state.record = frames[0].record;
        playJob(frames.slice(1), () => {
            state.target = D.TARGET_EMPTY;
            state.installedPack = undefined;
            window.__PUSH__(D.DATAPACK_LIST_CHANGED_MESSAGE, {});
        });
        return ok({ activationId });
    }

    function dryRun() {
        switch (outcome().install) {
            case 'dry-run-problem': return ok(D.INVALID);
            case 'dry-run-failed': return D.DRY_RUN_FAILED;
            default: return ok(D.VALID);
        }
    }

    /** The clearing, as withOperationProgress narrates it: one push per step, then the end. */
    function clearDemoData(p) {
        const id = p.id;
        const startedAt = Date.now();
        const fails = outcome().clear === 'fails';
        const pushes = [];
        const all = D.clearStages(state.lastPreview);
        const stages = fails ? all.slice(0, 3) : all;
        for (const s of stages) {
            for (const step of s.steps) pushes.push(D.operationProgress({ id, state: 'running', stage: s.stage, step, expectation: s.expectation, startedAt }));
        }
        pushes.push(() => fails
            ? D.operationProgress({ id, state: 'failed', error: D.CLEAR_FAILED, startedAt, tookMs: Date.now() - startedAt })
            : D.operationProgress({ id, state: 'succeeded', note: D.clearedSentence(state.lastPreview), startedAt, tookMs: Date.now() - startedAt }));
        pushes.forEach((push, i) => setTimeout(() => {
            const payload = typeof push === 'function' ? push() : push;
            window.__PUSH__('operationProgress', payload);
        }, 350 + 550 * i));
    }

    window.__HOST__ = {
        answers: {
            'find-datapacks': () => ok(D.CATALOG),
            'get-datapack-detail': (p) => ok(D.detailOf(p.datapackName, p.version)),
            'get-datapack-import-target': () => ok(state.target),
            'list-installed-datapacks': () => ok(D.installedOf(state.installedPack, state.installedAt)),
            'get-datapack-activity': () => ok(D.ACTIVITY),
            'list-datapack-import-scopes': () => ok(D.SCOPES),
            'preview-datapack-changes': (p) => {
                const pack = packOf(p.datapackName, p.version);
                const held = state.target.datapack;
                return pack ? ok(D.changesFor(pack, !!held && held.name === pack.id.name && held.version === pack.id.version)) : ok(null);
            },
            // The pack's one Admin step, on the pack the project holds, when the pill asks for it.
            'get-datapack-setup-step': (p) => ok(setupStep(p, state.rootChecked)),
            'check-datapack-setup-step': (p) => {
                if (outcome().setup === 'open') state.rootChecked = state.rootChecked === 'failed' ? 'passed' : 'failed';
                return ok(setupStep(p, state.rootChecked));
            },
            // Add from File: the picker answers with a file, the load with what it stored.
            'open-datapack-zip': () => ok(D.OPENED_FILE),
            'load-datapack-zip': () => ok(D.loadOutcome(outcome().load === 'partly')),
            'delete-library-datapack': () => ok({ deleted: true }),
            'get-datapack-removal-changes': () => ok(D.NO_CHANGES),
            'get-datapack-removal-scope': (p) => {
                const held = state.target.datapack;
                return ok(held && held.name === p.datapackName && held.version === p.version ? D.REMOVAL_SCOPE : D.NO_RECORD_SCOPE);
            },
            'validate-datapack-import': dryRun,
            'start-datapack-import': startImport,
            'reset-datapack': startReset,
            'get-datapack-import-status': () => ok(state.record),
            'check-demo-data': (p) => {
                const answer = D.checkDemoData(p.stores || [], `wipe-${Date.now().toString(36)}`);
                if (answer.preview) state.lastPreview = answer.preview;
                return ok(answer);
            },
            'getOperationProgress': () => ok(null),
        },
        delayMs: (type) => ({
            'find-datapacks': 700,
            'get-datapack-import-target': 500,
            'list-installed-datapacks': 600,
            'get-datapack-detail': 600,
            'preview-datapack-changes': 900,
            'list-datapack-import-scopes': 600,
            'validate-datapack-import': 1400,
            'start-datapack-import': 1100,
            'reset-datapack': 1100,
            'get-datapack-removal-changes': 800,
            'get-datapack-removal-scope': 500,
            'check-demo-data': 1000,
            'check-datapack-setup-step': 1500,
            'open-datapack-zip': 900,
            'load-datapack-zip': 1800,
            'delete-library-datapack': 900,
            'get-datapack-import-status': 150,
        }[type] || 300),
        onPlain: (type, payload) => {
            if (type === 'clear-demo-data') clearDemoData(payload);
        },
    };
})();
