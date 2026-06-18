/**
 * Shared fake credentials for tests.
 *
 * NEVER put realistic-looking secrets in test fixtures — secret scanners
 * (GitGuardian, ggshield, etc.) flag them as incidents, which then block CI and
 * have to be triaged by hand. Use these obvious placeholders, or values that
 * plainly are not secrets (e.g. `'fake-…'`, `'test-only-…'`).
 *
 * See `tests/README.md` › "Credentials in tests" for the convention, and
 * `.pre-commit-config.yaml` for the local ggshield hook that catches real ones.
 */
export const FAKE_CREDENTIALS = {
    username: 'test-user',
    password: 'fake-test-pw-not-a-secret',
} as const;
