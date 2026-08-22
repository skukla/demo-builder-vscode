#!/usr/bin/env node
/**
 * Generate the .demo-builder.json manifest schema from the ProjectManifest
 * TypeScript interface (src/core/state/projectFileLoader.ts).
 *
 * The manifest is USER-machine data written by any historical extension
 * version; the loader validates it against this schema at load time in
 * WARN mode (see src/core/state/manifestValidation.ts — never refuses a
 * load). The schema is generated, not hand-written, so it cannot drift from
 * the interface — and tests/templates/manifest-schema-freshness.test.ts
 * regenerates it and diffs against the committed file, so the committed copy
 * cannot drift from the generator either. If that test fails:
 *
 *   npm run generate:manifest-schema
 *
 * Tolerant on purpose (`additionalProperties: true`): manifests cross
 * extension versions in BOTH directions, so unknown fields are expected and
 * must not warn. Known fields still get their types checked.
 */

const path = require('path');

const OUTPUT = path.join(__dirname, '../src/core/state/config/manifest.schema.json');

/** The one generation config — the freshness test imports this. */
function generateManifestSchema() {
    // Lazy require: ts-json-schema-generator is a devDependency; this module
    // is only ever loaded at build/test time, never bundled into the extension.
    const { createGenerator } = require('ts-json-schema-generator');
    const generator = createGenerator({
        path: path.join(__dirname, '../src/core/state/projectFileLoader.ts'),
        tsconfig: path.join(__dirname, '../tsconfig.json'),
        type: 'ProjectManifest',
        skipTypeCheck: true,
        additionalProperties: true,
    });
    return generator.createSchema('ProjectManifest');
}

module.exports = { generateManifestSchema, OUTPUT };

if (require.main === module) {
    const fs = require('fs');
    const schema = generateManifestSchema();
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(schema, null, 2) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), OUTPUT)} (${JSON.stringify(schema).length} bytes)`);
}
