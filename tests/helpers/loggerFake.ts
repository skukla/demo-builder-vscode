/**
 * The canonical logger fake (ADR-016 § Fixtures and fakes).
 *
 * WHY THIS EXISTS. `createMockLogger` was defined NINE times, in nine files,
 * with four different return types — `Logger`, `jest.Mocked<Logger>`, `any`, and
 * none at all — and with `trace` present in some and missing from others. On top
 * of those, 559 more logger fakes are written inline as object literals across
 * two shapes differing by that same method.
 *
 * Nobody was unwilling to share. Nine people each wrote this because finding the
 * other eight was harder than typing it again. That is what a canonical home is
 * for.
 *
 * TYPED, deliberately: `jest.Mocked<Logger>` gives callers `.mockReturnValue`
 * and `.toHaveBeenCalledWith` on every method, AND makes this file stop
 * compiling the day `Logger` gains one — one failure, in one place, instead of
 * 568 fakes quietly ceasing to resemble the thing they stand for. That is
 * ADR-016 rule 2, and it is why none of the nine originals could catch drift:
 * four were untyped and one was `any`.
 *
 * The method list is read from `src/types/logger.ts`, not remembered (rule 3).
 * `Logger` is five methods; the six extra on `DebugLogger` are deliberately NOT
 * here, because no test in the corpus uses them — a fake mirroring a whole
 * interface drifts the moment the interface grows something nobody calls.
 */

import type { Logger } from '@/types/logger';

/**
 * A logger whose every method is a jest mock.
 *
 * @param overrides - replace individual methods, e.g. to assert on a real
 *   implementation or to capture output.
 */
export function createMockLogger(
    overrides: Partial<jest.Mocked<Logger>> = {}
): jest.Mocked<Logger> {
    return {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        ...overrides,
    };
}
