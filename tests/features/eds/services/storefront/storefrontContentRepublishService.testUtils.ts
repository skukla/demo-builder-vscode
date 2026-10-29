/**
 * The Helix seam the `republishStorefrontContent` family hands the pipeline.
 *
 * Helix arrives through the pipeline's own params rather than by mocking the module
 * (ADR-016's mock-wall conversion). The three methods below are everything the pipeline
 * calls on it, so the fake states the real surface instead of intercepting the
 * constructor. Shared by the base suite and the store-change suite (EDS-44).
 */

import type { HelixService } from '@/features/eds/services/helix/helixService';

/** The three calls, each a mock a suite can script and assert on. */
export const helixCalls = {
    previewCode: jest.fn(async (..._args: unknown[]) => undefined),
    purgeCacheAll: jest.fn(async (..._args: unknown[]) => undefined),
    publishAllSiteContent: jest.fn(async (..._args: unknown[]) => undefined),
};

/** The seam itself, as the pipeline's params declare it. */
export const fakeHelix = helixCalls as unknown as HelixService;
