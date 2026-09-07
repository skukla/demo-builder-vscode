/**
 * Shared setup for the `diagnostics` suites.
 *
 * The family re-formed on 2026-09-07 (PL-45) when the copy-report tests left for
 * `diagnosticsReport-copyReport.test.ts` — their subjects are declared in
 * `diagnosticsReport.ts` and only re-exported by `diagnostics.ts`. What remained
 * split into `diagnostics-command` and `diagnostics-runAction`, two suites over
 * one subject with nothing shared between them, which
 * `tests/sop/test-family-setup.test.ts` refuses.
 *
 * This file owns the SUT import deliberately. `diagnostics-command` declares four
 * module mocks, and mocks hoist above the imports of the spec that declares them —
 * so a spec importing the subject directly can bind the real module before its own
 * mocks register. Reaching it through here keeps that ordering safe for both
 * suites and for any third that joins them.
 *
 * `createMockDebugLogger` is re-exported rather than re-created: it is the house
 * builder, and `tests/sop/canonical-fakes.test.ts` refuses a hand-rolled stand-in.
 */

export { DiagnosticsCommand, runDiagnosticsAction } from '@/commands/diagnostics';
export type { DiagnosticsReport } from '@/commands/diagnostics';

export { createMockDebugLogger } from '../helpers/debugLoggerFake';
