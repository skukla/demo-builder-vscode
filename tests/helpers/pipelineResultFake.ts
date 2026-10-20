/**
 * The canonical fake of what `executeEdsPipeline` returns (ADR-016 § Fixtures).
 *
 * WHY IT EXISTS. Thirty-three suites wrote the result by hand as untyped
 * `mockResolvedValue({...})` literals. When EDS-55 made `warnings` a required field, the
 * typechecker caught the few literals that happened to be typed and none of the rest;
 * the reset suites then failed at run time on a field their fakes never had, and the
 * first fix was to patch thirty literals by hand. A required field added later would
 * have been invented thirty times again. Built here, typed to the real interface, a new
 * required field fails to compile in ONE place.
 *
 * PROVENANCE. The defaults are the result `executeEdsPipeline` returns for a run that
 * copied, published and warned nothing (`src/features/eds/services/edsPipeline.ts`, the
 * two `return` statements at the end of `executeEdsPipeline`); every field comes from
 * `EdsPipelineResult`, not from memory.
 */

import type { EdsPipelineResult } from '@/features/eds/services/edsPipeline';

/**
 * A pipeline result: a clean success unless the overrides say otherwise.
 *
 * @param overrides - the fields a suite cares about (`success: false` with `error`,
 *   `contentFilesCopied`, `libraryPaths`, `warnings`, `leftoverPages`, `patchReport`)
 * @returns an `EdsPipelineResult`
 */
export function createMockPipelineResult(overrides: Partial<EdsPipelineResult> = {}): EdsPipelineResult {
    return { success: true, contentFilesCopied: 0, libraryPaths: [], warnings: [], ...overrides };
}
