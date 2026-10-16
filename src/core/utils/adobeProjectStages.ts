/**
 * Deleting an Adobe Developer Console project: its steps, in the one stage table
 * (`operationStages.ts` spreads them into `OPERATION_STAGES`), so the delete names them
 * as every other flow names its steps (progress vocabulary, owner 2026-10-16).
 *
 * The teardown (`consoleProjectTeardown.ts`) runs them in this order; a step with
 * nothing to do (no event setup) is skipped and the count moves on.
 *
 * Expectations are first estimates, not measured: no teardown's step timings are in
 * the Debug Logs read on 2026-10-16.
 */

export const ADOBE_PROJECT_STAGES = {
    findingWorkspaces: {
        label: 'Finding workspaces',
        expectation: 'Usually a few seconds',
        detail: "The project's workspaces in Adobe Developer Console",
    },
    checkingCredentials: {
        label: 'Checking credentials',
        expectation: 'Usually a few seconds',
        detail: 'The credentials each workspace uses for Adobe I/O Events',
    },
    removingEventSetup: {
        label: 'Removing event setup',
        expectation: 'Usually under a minute',
        detail: 'Event registrations and providers the project created',
    },
    deletingAdobeProject: {
        label: 'Deleting the project',
        expectation: 'Usually a few seconds',
        detail: 'The project itself, in Adobe Developer Console',
    },
} as const;
