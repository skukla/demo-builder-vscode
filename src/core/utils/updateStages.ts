/**
 * Applying updates, in the one stage table
 * (`operationStages.ts`, which spreads them into `OPERATION_STAGES`). The same rules
 * hold: a label that fits beside its operation's title, a verb from the one list, an
 * expectation and a detail.
 *
 * WHY (progress vocabulary slice 7, owner 2026-10-16): the update notifications called
 * VS Code's progress themselves, so an agent heard none of them, and their messages
 * were whatever came to hand: a project's name, "api-mesh in demo", "Installing".
 *
 * A template update took 6 seconds with nothing to merge (2026-10-14); where a line says
 * FIRST ESTIMATE it was not measured. The check's own eight steps were deleted on
 * 2026-10-20 (PL-80): the Updates modal shows one "Checking for updates" while it runs.
 */

export const UPDATE_STAGES = {
    // FIRST ESTIMATE, NOT MEASURED: a fork sync is one GitHub call per repo. Reported by
    // the shared apply (`updateApplyService.ts`), the Updates modal's and the agent's.
    syncingSourceRepos: {
        label: 'Syncing source repos',
        expectation: 'Usually a few seconds',
        detail: 'Syncing forks with upstream',
    },
    updatingTemplate: {
        label: 'Updating the template',
        expectation: 'Usually under a minute',
        detail: 'Merging template changes',
    },
    // FIRST ESTIMATE, NOT MEASURED: no component update is in the logs.
    updatingComponents: {
        label: 'Updating components',
        expectation: 'Under a minute each',
        detail: 'Downloading and installing releases',
    },
    // FIRST ESTIMATE, NOT MEASURED: no Adobe MCP update is in the logs.
    updatingAiTools: {
        label: 'Updating the AI tools',
        expectation: 'Usually under a minute',
        detail: 'Updating MCP package and AI files',
    },
    // FIRST ESTIMATE, NOT MEASURED: a block library update is one commit; the
    // Inspector SDK only records its new commit. Reported by the shared apply.
    updatingAddOns: {
        label: 'Updating add-ons',
        expectation: 'Usually under a minute',
        detail: 'Updating libraries and Inspector SDK',
    },
    // FIRST ESTIMATE, NOT MEASURED: one git fetch of the storefront, after every
    // update that wrote to it (`localStorefrontRefresh.ts`).
    updatingLocalCopy: {
        label: 'Updating your local copy',
        expectation: 'Usually a few seconds',
        detail: 'Pulling from GitHub',
    },
    // FIRST ESTIMATE, NOT MEASURED: no integration update is in the logs. Each pair
    // redeploys, so it is the deploy's 1–2 minutes.
    updatingIntegrations: {
        label: 'Updating integrations',
        expectation: 'Usually 1–2 minutes each',
        detail: 'Redeploying integrations',
    },
    // FIRST ESTIMATE, NOT MEASURED: no extension update is in the logs.
    downloadingUpdate: {
        label: 'Downloading the update',
        expectation: 'Usually a few seconds',
        detail: 'Downloading from GitHub',
    },
    // FIRST ESTIMATE, NOT MEASURED.
    installingUpdate: {
        label: 'Installing the update',
        expectation: 'Usually a few seconds',
        detail: 'Installing extension',
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;
