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
 *   - `components` also exists ON THE MANIFEST, and IS an array of id STRINGS.
 *     (The earlier invention was an array of objects standing in for the record.)
 *     But it is NOT on `Project`, and this file set it anyway until 2026-09-01 —
 *     the note above was a true statement about the manifest, written into a
 *     builder that returns a Project, where the next reader takes it as a claim
 *     about the type. Nothing in production reads `project.components`.
 *   - the frontend port lives on the INSTANCE whose `type` is `frontend`;
 *     there is no top-level `frontendPort`.
 *   - `adobe` carries organization + organizationName + projectId + workspace
 *     and their *Name/*Title variants.
 *
 * AND THE ONE THE MANIFEST CANNOT TELL YOU. `created`/`lastModified` are ISO
 * STRINGS on disk and `Date` objects in memory — `ProjectManifest` declares
 * `string`, `Project` declares `Date`, and `projectFileLoader` converts at the
 * boundary. Reading a manifest gives you the persisted shape, which is not the
 * shape production passes around. Read the TYPE too.
 *
 * Keep it that way: if this needs a new field, read a real manifest again
 * rather than adding what seems reasonable — AND check the field against the
 * `Project` type, because the manifest carries fields memory does not. That is not
 * hypothetical: `version: '1.0.0'` sat here until 2026-09-01 for exactly that
 * reason, and only removing this function's own cast revealed it.
 */

import type { Project } from '@/types/base';

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
        // NO `version`, though the real manifest carries `version: '1.0.0'`.
        //
        // It is a MANIFEST field and `Project` does not declare it — the same
        // distinction the dates note below makes, in the other direction: there the
        // manifest holds strings where memory holds Dates; here the manifest holds a
        // field memory does not have at all. Nothing in `projectFileLoader` reads it
        // onto a Project, and `stateManager`'s `version` is the extension-state
        // NUMBER, not this string.
        //
        // It was here until 2026-09-01, hidden by this function's own
        // `as unknown as Project`, so every suite using the canonical fixture carried
        // a field production never sees. Removing the cast is what surfaced it —
        // which is the argument against the cast, not against the builder.
        //
        // `formatVersion` went the same way and for the same reason:
        // `projectConfigWriter` STAMPS it on the manifest and `manifestFormatSweep`
        // reads it straight off the parsed JSON. Neither puts it on a Project.
        // DATES, not the strings the manifest holds. This is the distinction the
        // provenance note below got wrong for three days: `ProjectManifest.created`
        // is a `string` on disk and `Project.created` is a `Date` in memory, and
        // projectFileLoader converts between them. Copying the manifest was the right
        // instinct aimed at the wrong artifact, and the `as unknown as Project` cast
        // at the bottom of this function is what stopped tsc from saying so.
        created: new Date('2026-01-01T00:00:00.000Z'),
        lastModified: new Date('2026-01-01T00:00:00.000Z'),
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
        componentInstances: {},
        componentConfigs: {},
        componentVersions: {},
        ...overrides,
    };
}
