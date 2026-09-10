/**
 * A canonical fake covers its subject's WHOLE public surface, and invents nothing.
 *
 * WHY BOTH DIRECTIONS MATTER, and both have already gone wrong here.
 *
 * MISSING a method is how a builder stops being adoptable. `stateManagerFake`
 * answered exactly one method for months; two files imported it while FIFTY
 * hand-rolled their own, in 22 distinct shapes. A fake narrower than the need does
 * not reduce divergence, it grows it.
 *
 * INVENTING one is worse, because it is silent. Five members appeared in
 * hand-rolled StateManager fakes that do not exist on StateManager at all —
 * `setState`, `getState`, `clearState`, `addRecentProject`, `getOrganizations`.
 * Three are called nowhere in `src/`. On 2026-09-01 the same defect turned up in
 * two Logger fakes carrying `setContext`, `with`, `show` and `dispose`, none of
 * which are on `Logger` and none of which anything calls. Every one sat behind a
 * cast.
 *
 * `jest.Mocked<T>` catches an invented member at compile time — which is why the
 * builders are typed — but it does NOT catch a missing one, because every builder
 * ends in a cast to satisfy the mock type. This suite closes that half.
 *
 * It reads the subject from SOURCE rather than a remembered list (ADR-016 rule 3).
 *
 * @see tests/helpers/authenticationServiceFake.ts
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section B
 */

import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(rel: string): string {
    const raw = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    // Strip comments: a method NAMED in a docblock is not a method.
    return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Public method names on a class, excluding `private` ones and the constructor. */
function publicMethodsOfClass(rel: string, className: string): Set<string> {
    const src = read(rel);
    const body = src.slice(src.indexOf(`export class ${className}`));
    const all = new Set<string>();
    for (const m of body.matchAll(/^ {4}(?:public\s+)?(?:async\s+)?([a-zA-Z]\w*)\s*\(/gm)) {
        if (m[1] !== 'constructor') all.add(m[1]);
    }
    for (const m of body.matchAll(/^ {4}private\s+(?:async\s+)?([a-zA-Z]\w*)\s*\(/gm)) {
        all.delete(m[1]);
    }
    return all;
}

/** Member names a builder assigns a jest.fn to. */
function membersFaked(rel: string): Set<string> {
    return new Set(Array.from(read(rel).matchAll(/^\s+([a-zA-Z]\w*): jest\.fn/gm), (m) => m[1]));
}

/** Each row: the fake, the source it stands for, and the exported symbol there. */
const PAIRS: Array<{ fake: string; source: string; className: string }> = [
    {
        fake: 'tests/helpers/authenticationServiceFake.ts',
        source: 'src/features/authentication/services/authenticationService.ts',
        className: 'AuthenticationService',
    },
];

describe('a canonical fake mirrors its subject exactly', () => {
    it('CONTROL: the readers see a real surface, not an empty one', () => {
        // A zero on either side would make every assertion below vacuous — the
        // failure mode this repo keeps finding in its own instruments.
        for (const { fake, source, className } of PAIRS) {
            expect(publicMethodsOfClass(source, className).size).toBeGreaterThan(5);
            expect(membersFaked(fake).size).toBeGreaterThan(5);
        }
    });

    it.each(PAIRS.map((p) => [p.className, p] as const))(
        '%s: the fake covers every public method and invents none',
        (_name, pair) => {
            const real = publicMethodsOfClass(pair.source, pair.className);
            const faked = membersFaked(pair.fake);
            expect({
                missing: [...real].filter((m) => !faked.has(m)).sort(),
                invented: [...faked].filter((m) => !real.has(m)).sort(),
            }).toEqual({ missing: [], invented: [] });
        }
    );
});
