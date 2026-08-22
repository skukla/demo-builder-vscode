/**
 * Manifest schema freshness — the committed generated schema must match what
 * the generator produces from the CURRENT ProjectManifest interface.
 *
 * Without this, the generated schema is just one more unenforced copy: edit
 * the interface, forget to regenerate, and runtime validation checks
 * yesterday's shape. On failure:
 *
 *   npm run generate:manifest-schema
 */

import * as fs from 'fs';

// Plain node module by design — the test uses the SAME generation config the
// script writes with, so they cannot diverge.
 
const { generateManifestSchema, OUTPUT } = require('../../scripts/generate-manifest-schema.js');

describe('manifest.schema.json freshness', () => {
    it('committed schema matches a fresh generation from ProjectManifest', () => {
        const committed = JSON.parse(fs.readFileSync(OUTPUT, 'utf-8'));
        const fresh = JSON.parse(JSON.stringify(generateManifestSchema()));
        expect(committed).toEqual(fresh);
    });
});
