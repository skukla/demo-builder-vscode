/**
 * Hand-written declarations for the plain-JS recorder so the test tree typechecks
 * (tsconfig.test.json has no allowJs). Keep in sync with pipelineLast.js.
 */

export function withLast(text: string, step: string, date: string): string;

export function recordRun(step: string, options?: { file?: string; date?: string }): boolean;
