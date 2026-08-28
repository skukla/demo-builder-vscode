/**
 * The canonical `Project` fixture (ADR-016 § Fixtures).
 *
 * ELEVEN builders existed under two names, across three return types
 * (`Project`, `Partial<Project>`, `any`), each setting whichever four or five
 * fields its own suite happened to need.
 *
 * This one is LAST in the consolidation queue on purpose. A wrong `Project`
 * shape typechecks — the fields are optional — and fails only when real
 * accessor code touches it. That has already happened once: a status-tool test
 * invented `components: [...]` as an array of component OBJECTS plus a
 * top-level `frontendPort`, and three tests failed against the real accessors.
 *
 * PROVENANCE. The shape below is copied from a REAL manifest —
 * `~/.demo-builder/projects/bodea/.demo-builder.json`, read 2026-08-28 — not
 * composed from memory, per ADR-016 rule 3. What reading it settled:
 *
 *   - `componentInstances` is a RECORD keyed by component id, not an array.
 *   - `components` also exists, and IS an array — of id STRINGS. Both are real
 *     and they are not alternatives to each other. (The earlier invention was
 *     an array of objects standing in for the record.)
 *   - the frontend port lives on the INSTANCE whose `type` is `frontend`;
 *     there is no top-level `frontendPort`.
 *   - `adobe` carries organization + organizationName + projectId + workspace
 *     and their *Name/*Title variants.
 *
 * Keep it that way: if this needs a new field, read a real manifest again
 * rather than adding what seems reasonable.
 */

import type { Project } from '@/types';

/**
 * A ready EDS-storefront instance, shaped as the real manifest stores it.
 *
 * OPT-IN, not a default. The first version of this file made it the default and
 * twelve suites broke: a project that HAS an EDS frontend takes different
 * branches (start/stop demo refuse, edit routes differently), so suites whose
 * fixture had no frontend suddenly did. A canonical fixture supplies the real
 * SHAPE; it must not pick a product configuration on the caller's behalf.
 */
export function edsStorefrontInstance() {
    return {
        id: 'eds-storefront',
        name: 'EDS Storefront',
        type: 'frontend',
        status: 'ready',
        port: 3000,
        path: '/projects/demo/components/eds-storefront',
        repoUrl: 'https://github.com/acme/demo-storefront',
        branch: 'main',
        lastUpdated: '2026-01-01T00:00:00.000Z',
    };
}

/**
 * @param overrides - anything this suite genuinely varies. Everything else
 *   matches a real manifest, so an accessor reaching for an untouched field
 *   finds what production would.
 */
export function createMockProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'demo-project',
        // NO `title` default, though real manifests carry one: UI code prefers
        // title over name, so defaulting it made every project in a list render
        // as the same string. Third instance of the same lesson — a default
        // that production PREFERS is not a neutral default.
        path: '/projects/demo',
        version: '1.0.0',
        formatVersion: 2,
        created: '2026-01-01T00:00:00.000Z',
        lastModified: '2026-01-01T00:00:00.000Z',
        status: 'ready',
        adobe: {
            organization: '285361',
            organizationName: 'Acme Demo Org',
            authenticated: true,
            projectId: '4566206088345738527',
            projectName: 'AcmeDemo',
            workspace: 'workspace-123',
            workspaceName: 'Stage',
        },
        // Neutral by default — see edsStorefrontInstance's note. Suites that
        // need a configured project pass one in.
        componentSelections: {
            frontend: '',
            backend: '',
            dependencies: [],
            integrations: [],
            appBuilder: [],
        },
        components: [],
        componentInstances: {},
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    } as unknown as Project;
}
