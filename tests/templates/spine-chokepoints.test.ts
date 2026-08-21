/**
 * Spine choke-points — every audited action keeps ONE definitive path.
 *
 * The drift this guards: a working-but-localized implementation that does an
 * action's ground-truth effect (a CLI command, an API write) somewhere other
 * than the one shared spine every entry point is supposed to converge on.
 * History says this happens quietly (a second get-components-data handler, a
 * parallel add/remove runner) and only the touched path gets future fixes.
 *
 * Method (the 2026-08-22 mesh call-path audit, the worked example): find the
 * PRIMITIVE that IS the action — the literal shell command or API call — and
 * assert every occurrence in src/ lives inside the spine module. Entry points
 * may multiply freely; the primitive may not.
 *
 * Each audited action adds one describe block here. A failure means either a
 * second path was just written (move the call into the spine) or the spine
 * legitimately moved (update the allowlist in the same PR that moved it).
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** Recursively list .ts/.tsx files under src (skips nothing — dist is outside). */
function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...listSourceFiles(full));
        else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
}

/** Files whose CODE (not comments) matches BOTH patterns (anywhere in the file). */
function filesTouchingBoth(a: RegExp, b: RegExp): string[] {
    const hits: string[] = [];
    for (const file of listSourceFiles(SRC)) {
        const code = fs
            .readFileSync(file, 'utf8')
            .split('\n')
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join('\n');
        if (a.test(code) && b.test(code)) hits.push(path.relative(SRC, file));
    }
    return hits;
}

/** Files whose CODE (not comments) matches the pattern. */
function filesTouchingPrimitive(pattern: RegExp): string[] {
    const hits: string[] = [];
    for (const file of listSourceFiles(SRC)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const codeHit = lines.some(
            (line) => pattern.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)
        );
        if (codeHit) hits.push(path.relative(SRC, file));
    }
    return hits;
}

describe('spine choke-points', () => {
    it('mesh DEPLOY: the api-mesh create/update primitive lives only in the deployment spine', () => {
        // The write that IS a mesh deployment. Both `:create`/`:update` and the
        // space-separated CLI forms count; reads (get/describe) and deletes are
        // different actions and deliberately not covered here.
        const primitive = /aio api-mesh[:\s]+(create|update)|api-mesh:\$\{command\}/;
        const spine = ['features/mesh/services/meshDeployment.ts'];

        const hits = filesTouchingPrimitive(primitive);

        // Positive control: the spine itself must register, so a rename or a
        // rewritten invocation cannot make this test pass on empty air.
        expect(hits).toEqual(expect.arrayContaining(spine));

        const strays = hits.filter((f) => !spine.includes(f));
        expect(strays).toEqual([]);
        // Verified 2026-08-22: six entry points (wizard creation, dashboard
        // deploy command, webview/MCP deploy-api-mesh, integrations runner,
        // EDS reset, non-EDS reset) all converge on deployMeshComponent here.
    });

    it('app-builder DEPLOY: the aio app deploy primitive lives only in appDeployment', () => {
        // Census 2026-08-22: exactly one code site issues the deploy;
        // the sibling of the mesh spine per the locked Option A architecture
        // (deployAppComponent, wrapped in withOrgContext by callers).
        // MCP tool-description STRINGS mention the command without running it —
        // the comment/prefix filter in filesTouchingPrimitive does not catch
        // string literals, so a description-text hit shows up as a stray and
        // must be quoted differently, not allowlisted.
        const primitive =
            /commandManager\.execute\(\s*'aio app deploy|`aio app deploy|"aio app deploy/;
        const spine = ['features/app-builder/services/appDeployment.ts'];

        const hits = filesTouchingPrimitive(primitive);

        expect(hits).toEqual(expect.arrayContaining(spine));
        expect(hits.filter((f) => !spine.includes(f))).toEqual([]);
    });

    it('app-builder UNDEPLOY: the aio app undeploy primitive lives only in the runner', () => {
        // Audited 2026-08-22: one invocation site — the remove flow's
        // kind-dispatched command (integration → app undeploy, mesh →
        // api-mesh:delete). Doors: dashboard remove + MCP remove_component,
        // both through removeAppBuilderComponent. actionDescriptors mentions
        // the command inside a tool DESCRIPTION string (starts with a paren,
        // so the exact-quoted-literal pattern below does not match it).
        const primitive = /'aio app undeploy'|`aio app undeploy`|"aio app undeploy"/;
        const spine = ['features/app-builder/services/appBuilderComponentRunner.ts'];

        const hits = filesTouchingPrimitive(primitive);

        expect(hits).toEqual(expect.arrayContaining(spine));
        expect(hits.filter((f) => !spine.includes(f))).toEqual([]);
    });

    it('mesh DELETE: the destructive command has ONE spelling, in meshDeleteCommand', () => {
        // Audited 2026-08-22: three legitimate doors (dashboard delete,
        // creation cancel-rollback, component removal) — three ACTIONS, one
        // primitive. Each keeps its own org targeting and execution options;
        // the command string itself lives once (it used to be spelled two
        // ways with independently chosen flags across the three sites).
        const primitive = /['"`]aio api-mesh[:\s]+delete/;
        const spine = ['features/mesh/services/meshDeleteCommand.ts'];

        const hits = filesTouchingPrimitive(primitive);

        expect(hits).toEqual(expect.arrayContaining(spine));
        expect(hits.filter((f) => !spine.includes(f))).toEqual([]);
    });

    it('adobe SIGN-IN/OUT: aio auth login/logout run only in authenticationService', () => {
        // Audited 2026-08-22: one login site (forced/normal ternary) and one
        // logout site, both in the service every auth door routes through.
        // Excluded by the pattern: diagnostics' `aio auth login --help`
        // capability probe (a read, not a sign-in — the lookahead skips it)
        // and ResetAllCommand's "run: aio auth logout" instruction text in a
        // log message (not quote-prefixed, so it never matches).
        const primitive = /['"`]aio (auth )?(login|logout)(?! --help)/;
        const spine = ['features/authentication/services/authenticationService.ts'];

        const hits = filesTouchingPrimitive(primitive);

        expect(hits).toEqual(expect.arrayContaining(spine));
        expect(hits.filter((f) => !spine.includes(f))).toEqual([]);
    });

    it('manifest WRITE: only the config writer and the MCP agent door write .demo-builder.json', () => {
        // Audited 2026-08-22: TWO doors by design, doing different jobs —
        // ProjectConfigWriter serializes the extension's Project state
        // (atomic, migration-aware); the MCP update_project_config tool
        // writes agent-supplied bytes (path-allowlisted, atomic, and since
        // this audit it refuses malformed JSON and reports schema warnings).
        // stateManager writes the GLOBAL state file and settingsTransfer
        // writes EXPORT files — they name the manifest without writing it,
        // which is why this check requires both patterns in one file.
        const namesManifest = /\.demo-builder\.json/;
        const writes = /writeFileAtomic\(|writeFile\(/;
        const spine = ['core/state/projectConfigWriter.ts', 'mcp-server.ts'];

        const hits = filesTouchingBoth(namesManifest, writes);

        expect(hits).toEqual(expect.arrayContaining(spine));
        expect(hits.filter((f) => !spine.includes(f))).toEqual([]);
    });
});
