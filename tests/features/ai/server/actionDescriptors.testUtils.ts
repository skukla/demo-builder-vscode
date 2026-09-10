/**
 * Shared setup for the three `actionDescriptors` suites.
 *
 * All three start the same way: take one row of `ACTION_DESCRIPTORS` by tool
 * name and assert something about it. Each had its own copy of that lookup, and
 * they disagreed about a missing row — one threw `Cannot read properties of
 * undefined`, one returned `undefined` and let the assertion report it.
 *
 * STATIC import, not a lazy `require` inside the helper. Both work at runtime —
 * `jest.mock` hoists above this file's import, so the preflight suite's mocked
 * catalog loader is in place either way. They do NOT measure the same, and the
 * difference is large: under `coverageAnalysis: perTest`, a lazy require makes
 * the descriptor array execute during whichever test calls the helper FIRST, so
 * Stryker attributes every mutant in the table to that one test and runs only
 * it. Measured 2026-09-05 on this module with no test changed — 3.15 tests per
 * mutant against 35.48, and the score fell from 57.44% to 22.15%.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import type { ToolDescriptor } from '@/features/ai/server/toolDescriptors';

/** One action row by tool name, or a failure that says which name missed. */
export function actionRow(tool: string): ToolDescriptor {
    const found = ACTION_DESCRIPTORS.find((d) => d.tool === tool);
    if (!found) throw new Error(`No ACTION_DESCRIPTORS row for '${tool}'`);
    return found;
}

/** Every action row, in registration order. */
export function actionRows(): ToolDescriptor[] {
    return ACTION_DESCRIPTORS;
}
