/**
 * Init payloads and canned messages for the webview visual-snapshot harness.
 *
 * WHY THIS FILE IS TYPESCRIPT, AND WHY IT LIVES IN `tests/`.
 *
 * The first version was an untyped `.mjs` script, and FIVE shapes in it were
 * invented rather than read — each one caught only when a surface visibly broke:
 *
 *   1. the component registry is keyed-by-id on disk and an ARRAY in the UI;
 *      the raw shape crashed configure with `frontends?.find is not a function`
 *   2. an invented `statusUpdate` payload crashed the dashboard AND integrations
 *      to an empty root, 72 elements down to 4
 *   3. the same push then used the wrong ENVELOPE — `data` where the client
 *      hands over `payload` — and crashed them again
 *   4. the on-disk manifest stores no `path` or `status` (the loader adds them),
 *      so the projects list sat on "Loading projects…" forever
 *   5. `WebviewClient` matches a response on `isResponse` + `responseToId`, not
 *      `type:'response'` + `requestId` — so NO request was ever answered, and it
 *      looked fine because every surface still rendered from its init payload
 *
 * Every one of those had an exported type sitting in `src/types/` that would
 * have failed to compile. The rule "never write a shape you have not read" is
 * documented in `mcp-tool-authoring`, `webview-test-authoring` and ADR-016 rule
 * 3 — three places — and it did not stop any of the five, because a rule in
 * prose is checked by whoever remembers it.
 *
 * `tsconfig.test.json` includes `tests/**`, so putting the shapes HERE and
 * typing them makes `npm run typecheck:tests` — which CI runs — read the shapes
 * instead. That is the difference between a rule and a mechanism.
 *
 * When a payload below needs a new field, widen the TYPE first and let the
 * compiler tell you what it requires.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type { Project } from '@/types/base';
import type { Message } from '@/types/messages';
import type { DashboardStatusUpdatePayload } from '@/types/webviewPayloads';
import type { SidebarContext } from '@/features/sidebar/types';
import type { TransformedComponentDefinition } from '@/types/components';

/**
 * The repo root, found by walking up for `package.json`.
 *
 * NOT `join(__dirname, '..', '..')`. This module is consumed two ways — imported
 * by jest from `tests/helpers/`, and bundled by `build-fixtures.mjs` into a temp
 * directory — and in the second, `__dirname` is that temp directory, so every
 * relative path silently resolved to nothing and the fixtures came back
 * "MISSING". Walking up is stable under both.
 */
function findRepoRoot(): string {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'src'))) return dir;
        dir = join(dir, '..');
    }
    return process.cwd();
}

const REPO = findRepoRoot();

/** Every surface the harness can drive, and the bundle key each maps to. */
export const SURFACES = [
    'wizard',
    'dashboard',
    'configure',
    'sidebar',
    'projectsList',
    'aiOverview',
    'integrations',
    'dataInstaller',
] as const;

export type Surface = (typeof SURFACES)[number];

function readJson<T>(relativePath: string): T | null {
    const full = join(REPO, relativePath);
    return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf8')) as T) : null;
}

/**
 * A real project manifest from disk when this machine has one.
 *
 * The FILE is not the in-memory `Project`: the loader supplies `path` (implied
 * by the directory) and `status`, and neither is stored. Typing the return as
 * `Project` is what forces this function to fill them — without it the projects
 * list never leaves its loading state, which is exactly how the omission was
 * found the first time.
 */
export function loadProjectFixture(): { project: Project; source: string } {
    const root = join(homedir(), '.demo-builder', 'projects');
    if (existsSync(root)) {
        for (const name of readdirSync(root)) {
            const manifest = join(root, name, '.demo-builder.json');
            if (!existsSync(manifest)) continue;
            const onDisk = JSON.parse(readFileSync(manifest, 'utf8')) as Partial<Project>;
            return {
                source: `real manifest: ${name} (+ loader-derived path/status)`,
                project: {
                    ...onDisk,
                    path: onDisk.path ?? join(root, name),
                    status: onDisk.status ?? 'ready',
                } as Project,
            };
        }
    }
    // Falls back to the canonical shape — see `tests/helpers/projectFake.ts`,
    // which was itself copied from a real manifest.
    return {
        source: 'canonical projectFake shape (no manifest on this machine)',
        project: {
            name: 'demo-project',
            title: 'Demo Project',
            path: '/projects/demo',
            status: 'ready',
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: [],
                integrations: [],
                appBuilder: [],
            },
            components: [],
            componentInstances: {},
        } as unknown as Project,
    };
}

/** The wizard's step list, from the config file the extension itself reads. */
export function loadWizardSteps(): unknown[] | null {
    const raw = readJson<{ steps?: unknown[] }>(
        'src/features/project-creation/config/wizard-steps.json'
    );
    return raw?.steps ?? null;
}

/**
 * The registry as `ComponentRegistryManager.loadRegistry()` hands it out.
 *
 * The raw JSON keys each category BY ID; consumers expect an ARRAY of
 * `{...definition, id}`. The return type is what makes that non-negotiable.
 */
export function loadRegistryFixture():
    | Record<string, TransformedComponentDefinition[]>
    | undefined {
    const raw = readJson<Record<string, Record<string, unknown>>>(
        'src/features/components/config/components.json'
    );
    if (!raw) return undefined;
    const toArray = (section: string): TransformedComponentDefinition[] =>
        Object.entries(raw[section] ?? {}).map(
            ([id, def]) => ({ ...(def as object), id }) as TransformedComponentDefinition
        );
    return {
        frontends: toArray('frontends'),
        backends: toArray('backends'),
        dependencies: toArray('dependencies'),
        integrations: toArray('integrations'),
        mesh: toArray('mesh'),
        appBuilder: toArray('appBuilder'),
    };
}

/**
 * Messages the harness PUSHES, typed as real `Message`s.
 *
 * This is the type that would have caught failure 5: `Message` has
 * `isResponse` and `responseToId` and no `requestId` at all, so the harness's
 * original reply shape could not have compiled.
 *
 * The two envelopes are deliberate and NOT interchangeable. The sidebar reads
 * the raw `event.data` because it bypasses `WebviewClient` (ADR-017 §4 / PL-19),
 * so its reply carries a `data` field; everything else receives
 * `message.payload`. Using the wrong one crashes the surface.
 */
export interface PushedMessage {
    /** For client-routed surfaces: delivered as `message.payload`. */
    payload?: unknown;
    /** For the sidebar's raw listener: delivered as `message.data`. */
    data?: unknown;
    type: string;
}

export function buildPushedMessages(project: Project): Record<string, PushedMessage> {
    const context: SidebarContext = { type: 'project', project };

    // Typed, so a missing required field fails the build rather than the surface.
    const status: DashboardStatusUpdatePayload = {
        name: (project.title ?? project.name) as DashboardStatusUpdatePayload['name'],
        path: project.path,
        status: project.status,
        frontendConfigChanged: false,
        adobeOrg: project.adobe?.organizationName,
        adobeProject: project.adobe?.projectName,
        edsStorefrontStatus: project.edsStorefrontStatusSummary,
    };

    return {
        getContext: { type: 'contextResponse', data: { context } },
        requestStatus: { type: 'statusUpdate', payload: status },
    };
}

/** The reply envelope, typed — the shape that makes failure 5 impossible. */
export function buildResponse(toId: string, payload: unknown): Message {
    return {
        id: `${toId}-r`,
        type: 'response',
        isResponse: true,
        responseToId: toId,
        payload,
        timestamp: 0,
    };
}
