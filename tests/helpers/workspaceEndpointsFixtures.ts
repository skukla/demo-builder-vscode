/**
 * The extension-point registry body, typed to the production interface so a fixture
 * written here cannot drift from what `AdobeConsoleExtensionPoints` reads and writes
 * (ADR-016 rule 3: a shape outside a typechecked file WILL be invented). The shape is
 * `{ endpoints: { '<extension point id>': { '<operation>': ... } } }` — the Console API
 * spec's workspace `/endpoints` body, which the GET answers and the PUT replaces.
 */

import type { WorkspaceEndpointsBody } from '@/features/authentication/services/adobeConsoleExtensionPoints';

/** The Admin UI SDK point an ERP integration publishes, as Adobe's registry holds it. */
export const ADMIN_UI_POINT = 'commerce/backend-ui/1';

/** A second point in the same workspace, which a removal must leave alone. */
export const OTHER_POINT = 'dx/excshell/1';

/** A workspace holding both points. */
export const TWO_POINTS: WorkspaceEndpointsBody = {
    endpoints: {
        [ADMIN_UI_POINT]: { view: [{ href: 'https://example.adobeio-static.net/index.html' }] },
        [OTHER_POINT]: { view: [{ href: 'https://example.adobeio-static.net/shell.html' }] },
    },
};

/** The same workspace once the Admin UI point is unpublished. */
export const ONLY_OTHER: WorkspaceEndpointsBody = {
    endpoints: {
        [OTHER_POINT]: TWO_POINTS.endpoints?.[OTHER_POINT],
    },
};
