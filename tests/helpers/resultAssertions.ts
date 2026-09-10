/**
 * Narrowing assertions for the `{ success: true, ... } | { success: false, ... }`
 * results this codebase returns from handlers and services.
 *
 * WHY THESE EXIST. The pattern they replace was everywhere:
 *
 *     expect(result.success).toBe(true);
 *     if (result.success) {                       // narrowing, not a branch
 *         expect(result.data.websites).toHaveLength(2);
 *     }
 *
 * The `if` is there only so TypeScript narrows the union — it is not a decision
 * the test is making. But `jest/no-conditional-expect` cannot tell those apart,
 * and it is right not to try: an `expect` inside a conditional is an assertion
 * that might not run, and 28 sites written this way is 28 places where a reader
 * has to work out which kind it is.
 *
 * An `asserts` function narrows for the REST OF THE BLOCK, so the assertions
 * come out of the conditional entirely and always execute.
 *
 * Both are registered in `assertFunctionNames` in `eslint.config.mjs`; without
 * that, a test whose only assertion is one of these reads as assertion-free.
 */

/**
 * Assert a result succeeded, and narrow it to the success variant.
 *
 * @param result the discriminated union to narrow
 * @param because optional context shown when it fails — a bare `false !== true`
 *                on line 200 of a table-driven test says very little
 */
export function assertOk<T extends { success: boolean }>(
    result: T,
    because?: string,
): asserts result is Extract<T, { success: true }> {
    // The error field is included in the failure output deliberately: when this
    // fails, the reason is on the object and printing only `false` throws it away.
    expect({ success: result.success, because, detail: (result as { error?: unknown }).error })
        .toEqual({ success: true, because, detail: undefined });
}

/** Assert a result failed, and narrow it to the failure variant. */
export function assertNotOk<T extends { success: boolean }>(
    result: T,
    because?: string,
): asserts result is Extract<T, { success: false }> {
    expect({ success: result.success, because }).toEqual({ success: false, because });
}

/**
 * Assert a value is present, and narrow away `undefined`/`null`.
 *
 * Replaces the other half of the conditional-expect problem:
 *
 *     expect(manifestCall).toBeDefined();
 *     if (manifestCall) {                     // narrowing, again
 *         expect(JSON.parse(manifestCall[1]).name).toBe('Test Project');
 *     }
 *
 * Same reasoning as `assertOk`: the `if` is for the compiler, not for the test,
 * and leaving it there means the assertions inside are skippable in a way a
 * reader has to verify by eye.
 */
export function assertDefined<T>(
    value: T,
    because?: string,
): asserts value is NonNullable<T> {
    expect({ present: value !== undefined && value !== null, because })
        .toEqual({ present: true, because });
}

/**
 * Assert a tagged union is a particular variant, and narrow to it.
 *
 * For unions discriminated by something other than `success`. Same shape as
 * `assertOk`, same reason:
 *
 *     expect(decision).toMatchObject({ action: 'fail' });
 *     if (decision.action === 'fail') {            // narrowing
 *         expect(decision.message).toMatch(/not running/i);
 *     }
 *
 * ONE HELPER PER DISCRIMINANT NAME, deliberately. A single generic taking the key
 * as a parameter does not narrow: `asserts v is Extract<T, Record<K, V>>` — and the
 * mapped-type spelling of the same idea — both leave the value at its union type.
 * Measured 2026-09-10 with all three forms side by side; only the concrete-key form
 * below narrows. Add another when a third discriminant needs one.
 */
export function assertKind<T extends { kind: string }, V extends T['kind']>(
    value: T,
    kind: V,
    because?: string,
): asserts value is Extract<T, { kind: V }> {
    expect({ kind: value.kind, because }).toEqual({ kind, because });
}

/** As `assertKind`, for unions discriminated by `action`. */
export function assertAction<T extends { action: string }, V extends T['action']>(
    value: T,
    action: V,
    because?: string,
): asserts value is Extract<T, { action: V }> {
    expect({ action: value.action, because }).toEqual({ action, because });
}
