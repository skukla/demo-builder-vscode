/**
 * A component-selection fixture (ADR-016 § Fixtures).
 *
 * Two definitions existed with incompatible signatures: one took
 * `(backend, appBuilder[])` positionally, the other an overrides object without
 * `appBuilder`. Neither subsumed the other, which is why both survived.
 *
 * The overrides form is canonical because it extends without breaking callers,
 * and it now carries `appBuilder` so it covers what the positional one was for.
 */

export interface MockComponentSelection {
    frontend: string;
    backend: string;
    dependencies: string[];
    integrations: string[];
    appBuilder: string[];
}

export function createComponentSelection(
    overrides: Partial<MockComponentSelection> = {}
): MockComponentSelection {
    return {
        frontend: 'react-app',
        backend: 'commerce-paas',
        dependencies: [],
        integrations: [],
        appBuilder: [],
        ...overrides,
    };
}
