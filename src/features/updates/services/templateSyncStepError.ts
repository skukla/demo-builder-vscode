/**
 * A template update step that failed.
 *
 * Its message is written for the SC and names the step. git's own output stays
 * out of it and goes to the Debug Logs, because a line like
 * `remote: error: GH006: Protected branch update failed` says neither what the
 * update was doing nor what to do next (ADR-023).
 */
export class TemplateSyncStepError extends Error {
    constructor(
        message: string,
        /** git's stderr, for the Debug Logs only. */
        readonly gitOutput: string,
    ) {
        super(message);
        this.name = 'TemplateSyncStepError';
    }
}
