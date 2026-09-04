/**
 * No credential-SHAPED string under tests/ — `scheme://user:password@host` or
 * `Basic <base64>` — even a fake one.
 *
 * WHY. This repository is public, and its secret scanner (GitGuardian) matches the
 * SHAPE, not the secret. On 2026-09-03 a fixture written minutes earlier —
 * a GitHub clone URL with `gh-token` as the user and `x-oauth-basic` as the password,
 * where the "token" was the literal word
 * gh-token — raised an alert on a pushed commit. It was not a credential and there
 * was nothing to rotate, but the rule here is never-enters, and an alert that has
 * to be triaged by hand each time teaches people to dismiss alerts.
 *
 * WHAT TO DO INSTEAD. Build the URL by parts: `new URL(base)`, set `.username` and
 * `.password`, read it back. The two helper tests that assert the injected-URL
 * contract and the validators that must ACCEPT a credentialed URL all do this now —
 * the same proof, spelled by no literal. Prose in a comment is caught too: write
 * "user-colon-password-at-host", not the shape.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');

const USERINFO_URL = /https?:\/\/[^/\s:@"'`]+:[^@\s"'`]+@/;
const BASIC_HEADER = /\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}/;

function files(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) out.push(...files(p));
        else if (/\.(ts|tsx|js|mjs|json|md)$/.test(name)) out.push(p);
    }
    return out;
}

describe('no credential-shaped string under tests/', () => {
    const corpus = files(join(ROOT, 'tests')).filter((f) => f !== __filename);

    it('CONTROL: the patterns match the shapes they ban and not their by-parts form', () => {
        const plantedUrl = ['https://alice', 'hunter2@example.com/repo'].join(':');
        const plantedHeader = ['Basic', 'dXNlcjpwYXNzd29yZDEyMzQ='].join(' ');
        expect(USERINFO_URL.test(`const u = '${plantedUrl}';`)).toBe(true);
        expect(BASIC_HEADER.test(`headers.Authorization = '${plantedHeader}';`)).toBe(true);
        expect(
            USERINFO_URL.test("const u = new URL('https://example.com/repo'); u.username = 'a';")
        ).toBe(false);
        expect(USERINFO_URL.test('mailto:someone@example.com')).toBe(false);
        expect(BASIC_HEADER.test("scheme === 'Basic'")).toBe(false);
    });

    it('CONTROL: the walk sees the corpus', () => {
        expect(corpus.length).toBeGreaterThan(500);
    });

    it('no file carries either shape', () => {
        const offenders: string[] = [];
        for (const f of corpus) {
            const body = readFileSync(f, 'utf8');
            const lines = body.split('\n');
            lines.forEach((line, i) => {
                if (USERINFO_URL.test(line) || BASIC_HEADER.test(line)) {
                    offenders.push(`${relative(ROOT, f)}:${i + 1}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });
});
