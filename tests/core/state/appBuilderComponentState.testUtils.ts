/**
 * Shared fixtures for the `appBuilderComponentState` family.
 *
 * The family split on 2026-09-21 when the workspace accessors arrived and the
 * original file was already 622 lines. What both halves build is a keyed component
 * entry, so it is built here — what `tests/sop` asks of a split family, and what
 * stops the two drifting.
 *
 * The PROJECT fixture is deliberately NOT here. `tests/helpers/projectFake` is the
 * canonical one, and a second exported `makeProject` is a duplicate builder name —
 * which is a rule of its own, and which this file broke on its first draft.
 *
 * No module mocks: these accessors are pure, so there is no hoisting order to
 * respect and the specs can import the subject directly.
 */

import type { AppBuilderComponentState } from '@/types/base';

/** A keyed component entry, deployed unless a test says otherwise. */
export function makeAppBuilderComponent(
    overrides: Partial<AppBuilderComponentState> = {}
): AppBuilderComponentState {
    return {
        kind: 'mesh',
        status: 'deployed',
        source: { owner: 'skukla', repo: 'commerce-paas-mesh' },
        ...overrides,
    };
}
