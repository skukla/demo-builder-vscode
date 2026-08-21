/**
 * Config contracts — every bundled config validates against its sibling schema.
 *
 * The `*.schema.json` files existed for years as editor decoration: only
 * demo-packages.json was ever validated against its schema by a test, so the
 * other eight pairs could drift apart (and from the TS interfaces the code
 * casts them to) with no failure until a feature read the drifted field. The
 * casts themselves cannot be removed — `resolveJsonModule` can't produce
 * literal-union types — so THIS suite is the check those casts suppress
 * (see .rptc/backlog/2026-08-21-bundled-config-json-is-cast-not-validated.md).
 *
 * Auto-discovers `<name>.schema.json` files under src/ and validates the
 * sibling `<name>.json` with Ajv. A new config joins by existing; the count
 * pin below is what keeps discovery honest.
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';

const SRC_ROOT = path.join(__dirname, '../../src');

/** Recursively find every *.schema.json under src/. */
function findSchemaFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist') continue;
            findSchemaFiles(full, out);
        } else if (entry.name.endsWith('.schema.json')) {
            out.push(full);
        }
    }
    return out;
}

const schemaFiles = findSchemaFiles(SRC_ROOT);

describe('config contracts — bundled JSON vs sibling schema', () => {
    // A vacuous pass is not a pass: if discovery breaks, zero pairs would
    // "all validate". 9 pairs existed when this suite landed (2026-08-21);
    // update the pin when a config is added or retired, not to make it fit.
    it('discovers all known schema/data pairs', () => {
        expect(schemaFiles.length).toBeGreaterThanOrEqual(9);
    });

    describe.each(schemaFiles.map((f) => [path.relative(SRC_ROOT, f), f]))(
        '%s',
        (_rel, schemaFile) => {
            const dataFile = schemaFile.replace(/\.schema\.json$/, '.json');

            it('has a sibling data file', () => {
                expect(fs.existsSync(dataFile)).toBe(true);
            });

            it('data validates against the schema', () => {
                const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
                const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

                // strict:false — these are long-lived hand-written draft-07
                // schemas; strict-mode nits (unknown keywords) are not the
                // contract this suite enforces.
                const ajv = new Ajv({ allErrors: true, strict: false });
                const validate = ajv.compile(schema);
                const valid = validate(data);

                // Readable failure: every violation with its instance path.
                const errors = (validate.errors ?? [])
                    .map((e) => `${e.instancePath || '/'} ${e.message}`)
                    .join('\n  ');
                expect(valid ? '' : errors).toBe('');
            });

            it("the data's $schema pointer resolves to this schema", () => {
                const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
                // Optional — but when present it must not dangle.
                if (typeof data.$schema === 'string') {
                    const resolved = path.resolve(path.dirname(dataFile), data.$schema);
                    expect(fs.existsSync(resolved)).toBe(true);
                    expect(resolved).toBe(schemaFile);
                }
            });
        }
    );
});
