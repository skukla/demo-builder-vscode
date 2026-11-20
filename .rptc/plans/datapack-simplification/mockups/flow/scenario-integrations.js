/*
 * The scripted extension host for proto-integrations.html: what the Integrations screen's
 * requests get back. Every answer's DATA comes from SCENARIO_INTEGRATIONS, built from
 * scenarioIntegrations.ts, which is typed against the extension's own interfaces; this file only
 * decides which answer, when, and in what order.
 *
 * Rebuild the data after editing scenarioIntegrations.ts (from the repo root):
 *   npx tsc --noEmit -p .rptc/plans/datapack-simplification/mockups/flow/tsconfig.json
 *   npx esbuild .rptc/plans/datapack-simplification/mockups/flow/scenarioIntegrations.ts --bundle \
 *     --format=iife --global-name=SCENARIO_INTEGRATIONS --alias:@=./src --outfile=<served dir>/scenarioIntegrations.js
 *
 * Order of events, read from the host handlers:
 *   Integration Settings: getIntegrationSettings when the window opens -> saveIntegrationSettings
 *     (a failure keeps the window and what was typed; a success closes it).
 *   Add ERP Integration: list-org-console-apis and check-erp-integration-holder when the flow
 *     opens -> addAppBuilderComponent
 *     WITHOUT confirm answers the store preview (or the refusal) -> Add and Apply posts it WITH
 *     confirm (a plain message) -> 'operationProgress' pushes narrate the add.
 */
(() => {
    const D = window.SCENARIO_INTEGRATIONS;
    const ok = (data) => ({ success: true, data });
    const outcome = () => window.__OUTCOME__();
    const state = { settings: D.SETTINGS };

    /** The add, as withOperationProgress narrates it: a few steps, then the end. */
    function narrateAdd(payload) {
        const id = payload.instanceId || payload.id;
        const startedAt = Date.now();
        const steps = [
            { stage: 'Preparing the Store', step: 'Price Scope' },
            { stage: 'Preparing the Store', step: 'Shared Catalogs' },
            { stage: 'Deploying', step: 'ERP Integration' },
        ];
        steps.forEach((s, i) => setTimeout(() => window.__PUSH__('operationProgress', { id, state: 'running', stage: s.stage, step: s.step, startedAt }), 400 + 700 * i));
        setTimeout(() => window.__PUSH__('operationProgress', { id, state: 'succeeded', startedAt, tookMs: Date.now() - startedAt }), 400 + 700 * steps.length);
    }

    window.__HOST__ = {
        answers: {
            getIntegrationSettings: () => ok(state.settings),
            saveIntegrationSettings: (p) => {
                if (outcome().save === 'fails') return D.SAVE_FAILED;
                const answer = D.saveSucceeded(p.values || {});
                state.settings = answer.settings;
                return answer;
            },
            addAppBuilderComponent: (p) => {
                if (p.confirm) return ok({});
                return outcome().add === 'refused'
                    ? { success: false, error: D.ADD_REFUSED }
                    : ok(D.addPreview(p.name || 'ERP Integration'));
            },
            'list-org-console-apis': () => ok({ apis: [] }),
            // No other local project runs an ERP integration on this instance.
            'check-erp-integration-holder': () => ok({}),
            getOperationProgress: () => ok(null),
        },
        delayMs: (type) => ({
            getIntegrationSettings: 500,
            saveIntegrationSettings: 1500,
            addAppBuilderComponent: 1500,
            'list-org-console-apis': 600,
        }[type] || 300),
        onPlain: (type, payload) => {
            if (type === 'addAppBuilderComponent' && payload.confirm) narrateAdd(payload);
        },
    };
})();
