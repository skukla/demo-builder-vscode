/**
 * How the MCP tool surface is read OUT OF SOURCE, shared by the tool enforcers.
 *
 * Two suites need the same thing — every registered tool, paired with the text of
 * its OWN declaration — and they need it derived independently of whatever the
 * generators believe. `tool-catalog-gating` uses it to check the published catalog
 * states every confirm gate; `tool-auth-declarations` uses it to check the declared
 * sign-ins.
 *
 * TWO DETAILS THAT ARE NOT INCIDENTAL, both learned the expensive way:
 *
 * BOTH REGISTRATION FORMS. Tools are declared either as `registerTool('name', {…})`
 * or as a descriptor row `{ tool: 'name', … }`. Matching only the first finds 66 of
 * 114 — which is exactly what a control caught on 2026-09-01 when the auth enforcer
 * was written against `registerTool(` alone.
 *
 * THE WINDOW IS BOUNDED BY THE NEXT DECLARATION. A fixed look-ahead reads into the
 * neighbour: `tool-catalog-gating` exists because a 600-character window let four
 * tools with long descriptions push their `confirm: true` out of range, and the
 * published catalog told agents they needed no confirmation. Bounding to the next
 * site cannot do that.
 *
 * @see tests/sop/tool-catalog-gating.test.ts
 * @see tests/sop/tool-auth-declarations.test.ts
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..');

/** One registered tool and the source text of its own declaration. */
export interface ToolDeclaration {
    /** The tool name as agents call it. */
    name: string;
    /** The file it is declared in, repo-relative. */
    file: string;
    /** Source from this declaration up to the next one — never beyond. */
    body: string;
}

/** Every tool declaration in the registrars and descriptor tables. */
export function toolDeclarations(): ToolDeclaration[] {
    const files = execSync(
        "git ls-files 'src/features/ai/server/*.ts' 'src/mcp-server.ts' 'src/mcp/*.ts'",
        { encoding: 'utf8', cwd: ROOT }
    )
        .split('\n')
        .filter(Boolean);

    const out: ToolDeclaration[] = [];
    for (const file of files) {
        const src = readFileSync(join(ROOT, file), 'utf8');
        const sites = [
            ...[...src.matchAll(/registerTool\(\s*'([a-z0-9_]+)'/g)],
            ...[...src.matchAll(/tool:\s*'([a-z0-9_]+)'/g)],
        ]
            .map((m) => ({ name: m[1], at: m.index as number }))
            .sort((a, b) => a.at - b.at);

        sites.forEach(({ name, at }, i) => {
            out.push({ name, file, body: src.slice(at, sites[i + 1]?.at ?? src.length) });
        });
    }
    return out;
}
