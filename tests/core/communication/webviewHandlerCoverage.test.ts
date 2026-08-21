/**
 * Webview handler coverage — EVERY panel, not just the one that broke.
 *
 * An unregistered message type is not an error, it is SILENCE: the webview's
 * request never resolves and the user watches a spinner until it times out.
 * That failure shipped twice in one day (2026-07-31) — `list-org-console-apis`
 * and then the whole destination set (`get-projects` and friends) — both on the
 * integrations panel, which renders a flow authored for the wizard.
 *
 * A guard existed for that one panel and still missed the second bug, because it
 * scanned a directory rather than the panel's real import graph. This suite walks
 * each webview ENTRY's transitive local imports, so a message can only be missed
 * if the file sending it is unreachable from the entry — in which case it is dead
 * code and cannot fire either.
 *
 * Adding a request to a shared component now fails HERE, listing every panel that
 * renders it, instead of in someone's Extension Host.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../../..');
const SRC = path.join(ROOT, 'src');

/** Webview entry → the command that owns that panel (esbuild WEBVIEW_ENTRIES). */
const PANELS: ReadonlyArray<{ name: string; entry: string; command: string; noRequests?: true }> = [
    {
        name: 'wizard',
        entry: 'features/project-creation/ui/wizard/index.tsx',
        command: 'features/project-creation/commands/createProject.ts',
    },
    {
        name: 'dashboard',
        // main.tsx, not index.tsx: an index.ts barrel sits beside it and tsc
        // keeps only one file per basename, so an index.tsx entry there was
        // never typechecked.
        entry: 'features/dashboard/ui/main.tsx',
        command: 'features/dashboard/commands/showDashboard.ts',
    },
    {
        name: 'configure',
        entry: 'features/dashboard/ui/configure/index.tsx',
        command: 'features/dashboard/commands/configure.ts',
    },
    {
        name: 'projectsList',
        entry: 'features/projects-dashboard/ui/index.tsx',
        command: 'features/projects-dashboard/commands/showProjectsList.ts',
    },
    {
        name: 'aiOverview',
        entry: 'features/dashboard/ui/aiSurface/index.tsx',
        command: 'features/dashboard/commands/openAi.ts',
    },
    {
        name: 'dataInstaller',
        entry: 'features/data-installer/ui/index.tsx',
        command: 'features/data-installer/commands/showDataInstaller.ts',
    },
    {
        name: 'integrations',
        entry: 'features/dashboard/ui/integrationsSurface/index.tsx',
        command: 'features/dashboard/commands/showIntegrations.ts',
    },
    {
        // Not a panel command: a WebviewViewProvider, but the same contract applies.
        // It sends no `request` at all — every action is a fire-and-forget
        // postMessage or a VS Code command — so it has nothing that can hang.
        // Recorded rather than omitted, so the coverage check still runs over it.
        name: 'sidebar',
        entry: 'features/sidebar/ui/index.tsx',
        command: 'features/sidebar/handlers/index.ts',
        noRequests: true,
    },
];

/**
 * Types handled by the shared communication layer rather than a panel's map.
 * Keep this SHORT and justified — every entry is a hole in the guard.
 */
const PLATFORM_HANDLED = new Set([
    // NOT the handshake — that is `__webview_ready__`, which the communication
    // manager answers directly and which never reaches a panel map. `ready` is an
    // application-level signal that WebviewApp sends only for hosts passing
    // `notifyReady` (the wizard, which registers it). This walk is import-graph
    // based, so it cannot see that the send is prop-conditional: WebviewApp sits in
    // every panel's graph. Listed here for that reason, not because the platform
    // handles it — the original justification here said "handshake,
    // WebviewCommunicationManager", which was wrong and is why five panels sat
    // logging "No handler registered for 'ready'" on every open (2026-08-03).
    'ready',
    'log', // debug passthrough, every panel
    'progress', // WebviewClient.reportProgress → base command
    // Shared helpers in core/ui/utils/vscode-api.ts. They sit in every panel's
    // import graph whether or not that panel ever calls them, so attributing them
    // per-panel is noise; each is a fire-and-forget with no reply to wait for.
    'cancel',
]);

/**
 * BOTH `request` and `postMessage`. Narrowing to `request` was tried and was wrong:
 * AdobeProjectPicker POSTS `get-projects` and waits for the extension to push the
 * result back, so an unregistered type hangs it exactly like an unresolved request —
 * that is the bug this suite exists for, and request-only did not catch it.
 *
 * The type-argument class is `[^()]` and NOT `[^>]`: a NESTED generic
 * (`request<HandlerResult<Workspace>>(...)`) ends the old class at the inner `>`,
 * so the pattern failed to match and the send became invisible. That is exactly how
 * `create-adobe-workspace` stayed unregistered on the integrations panel while this
 * suite reported full coverage (found 2026-08-03) — a green guard proving nothing.
 * Parentheses still bound the class, so it cannot run past the call it is matching.
 */
const SEND = /webviewClient\s*\.\s*(?:request|postMessage)\s*(?:<[^()]*>)?\s*\(\s*'([^']+)'/g;
const IMPORT = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;

/** Resolve an import specifier to a file under src/, or null if external. */
function resolve(spec: string, fromFile: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
    else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
    else return null; // node_modules

    for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
    ]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

/**
 * WebviewClient's named helpers (`requestProjects`, `requestAuth`, …) hide their
 * message literal inside the client, so a call site shows no string at all — which
 * is precisely how `get-projects` slipped past an earlier version of this suite.
 * The client is reachable from every panel, so its literals count as sent by all of
 * them: over-broad, but it fails LOUDLY instead of silently, and PLATFORM_HANDLED
 * absorbs the genuinely universal ones.
 */
function clientHelperTypes(): Map<string, string> {
    const source = fs.readFileSync(path.join(SRC, 'core/ui/utils/WebviewClient.ts'), 'utf8');
    const map = new Map<string, string>();
    // `public requestProjects(...) { ... this.postMessage('get-projects', ...) }`
    for (const m of source.matchAll(
        /(?:public\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)[^{]*\{[\s\S]{0,400}?this\s*\.\s*(?:request|postMessage)\s*(?:<[^>]*>)?\s*\(\s*'([^']+)'/g
    )) {
        map.set(m[1], m[2]); // method → message type
    }
    return map;
}

/** Every message type sent from a panel entry's transitive import graph. */
function sentTypes(entryRel: string): Map<string, string> {
    const origin = new Map<string, string>();
    const seen = new Set<string>();
    const queue = [path.join(SRC, entryRel)];

    while (queue.length) {
        const file = queue.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        // Strip comments first: a JSDoc @example showing `messageType: 'projects'`
        // is documentation, not a send, and counting it invents a phantom message.
        const source = fs
            .readFileSync(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        for (const m of source.matchAll(SEND)) {
            if (!origin.has(m[1])) origin.set(m[1], path.relative(ROOT, file));
        }
        // The selection hooks take the type as CONFIG (`messageType: 'get-projects'`)
        // and send it themselves, so the call site holds no client call at all. This
        // is how the destination pickers hung: nothing here looked like a send.
        for (const m of source.matchAll(/messageType:\s*'([^']+)'/g)) {
            if (!origin.has(m[1])) origin.set(m[1], path.relative(ROOT, file));
        }
        for (const m of source.matchAll(IMPORT)) {
            const next = resolve(m[1] ?? m[2], file);
            if (next) queue.push(next);
        }
    }
    // Second pass: a call to a named helper sends that helper's message.
    const helpers = clientHelperTypes();
    for (const file of seen) {
        // vscode-api.ts is a FACADE mirroring the client's whole API, so it "calls"
        // every helper regardless of what the panel actually uses. Counting it would
        // attribute every message to every panel.
        if (file.endsWith(path.join('core', 'ui', 'utils', 'vscode-api.ts'))) continue;
        const source = fs.readFileSync(file, 'utf8');
        for (const [method, type] of helpers) {
            if (origin.has(type)) continue;
            if (new RegExp(`webviewClient\\s*\\.\\s*${method}\\s*\\(`).test(source)) {
                origin.set(type, `${path.relative(ROOT, file)} (via webviewClient.${method})`);
            }
        }
    }
    return origin;
}

/**
 * Types a panel answers: keys of every handler map it can reach, plus any inline
 * map in the command file. Quoted AND bare keys — `selectProject: handler` is as
 * common here as `'get-projects': handler`, and missing that is how an earlier
 * audit produced false positives.
 */
function registeredTypes(commandRel: string): Set<string> {
    const types = new Set<string>();
    const seen = new Set<string>();
    const queue = [path.join(SRC, commandRel)];

    while (queue.length) {
        const file = queue.pop() as string;
        if (seen.has(file)) continue;
        seen.add(file);
        const source = fs.readFileSync(file, 'utf8');

        for (const m of source.matchAll(/['"]([a-zA-Z][\w-]*)['"]\s*:/g)) types.add(m[1]);
        for (const m of source.matchAll(/^\s{4,}([a-zA-Z][\w-]*)\s*:/gm)) types.add(m[1]);
        for (const m of source.matchAll(/on(?:Streaming)?\s*\(\s*['"]([^'"]+)['"]/g)) {
            types.add(m[1]);
        }

        // Follow into handler/registry modules only — the whole graph would drag in
        // unrelated string literals and make the check meaningless.
        for (const m of source.matchAll(IMPORT)) {
            const spec = m[1] ?? m[2];
            if (!/handler|Handler|Registry/.test(spec)) continue;
            const next = resolve(spec, file);
            if (next) queue.push(next);
        }
    }
    return types;
}

describe('webview handler coverage — every panel answers what its UI sends', () => {
    it('the panel list matches esbuild WEBVIEW_ENTRIES', () => {
        // A panel added to the build but not here would be silently unguarded.
        const config = fs.readFileSync(path.join(ROOT, 'esbuild.config.js'), 'utf8');
        const block = config.slice(
            config.indexOf('const WEBVIEW_ENTRIES'),
            config.indexOf('};', config.indexOf('const WEBVIEW_ENTRIES'))
        );
        const entries = [...block.matchAll(/^\s{4}(\w+):\s*'([^']+)'/gm)].map((m) => m[1]);

        expect(entries.sort()).toEqual(PANELS.map((p) => p.name).sort());
    });

    it.each(PANELS)(
        '$name sends the expected kind of traffic (guards a vacuous check)',
        ({ entry, noRequests }) => {
            // Without this, a broken import walk would return nothing and every
            // coverage assertion below would pass while proving nothing.
            const count = sentTypes(entry).size;
            if (noRequests) expect(count).toBe(0);
            else expect(count).toBeGreaterThan(0);
        }
    );

    it.each(PANELS)('$name registers every message it sends', ({ entry, command }) => {
        const registered = registeredTypes(command);
        const missing = [...sentTypes(entry)]
            .filter(([type]) => !registered.has(type) && !PLATFORM_HANDLED.has(type))
            .map(([type, from]) => `${type}  (sent from ${from})`);

        expect(missing).toEqual([]);
    });
});
