#!/usr/bin/env node
/**
 * Generate the JSON schemas for the three USER files the extension reads, from
 * their TypeScript interfaces:
 *
 *   - the project manifest `.demo-builder.json`      ← ProjectManifest
 *   - the exported project `<name>.project.demo-builder.json` ← ProjectFile
 *   - the shared-demo description `demo.demo-builder.json`    ← SharedDemoDescription
 *
 * All three cross extension versions in BOTH directions (a file written by a
 * newer build is read by an older one), so every schema is tolerant on purpose
 * (`additionalProperties: true`): unknown fields are expected and must not
 * warn; known fields still get their types checked. Version fields, not
 * strictness, are the mechanism.
 *
 * The schemas are generated, not hand-written, so they cannot drift from the
 * interfaces — and tests/templates/manifest-schema-freshness.test.ts regenerates
 * each one and diffs against the committed file, so the committed copies cannot
 * drift from the generator either. If that test fails:
 *
 *   npm run generate:manifest-schema
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'src/core/state/config');

/** The generation targets — the freshness test iterates this list. */
const TARGETS = [
    {
        typeName: 'ProjectManifest',
        source: path.join(ROOT, 'src/core/state/projectFileLoader.ts'),
        output: path.join(CONFIG_DIR, 'manifest.schema.json'),
    },
    {
        typeName: 'ProjectFile',
        source: path.join(ROOT, 'src/types/projectFile.ts'),
        output: path.join(CONFIG_DIR, 'project-file.schema.json'),
    },
    {
        typeName: 'SharedDemoDescription',
        source: path.join(ROOT, 'src/types/projectFile.ts'),
        output: path.join(CONFIG_DIR, 'shared-demo.schema.json'),
    },
];

/** One generation config per target — the freshness test calls this too. */
function generateSchema(target) {
    // Lazy require: ts-json-schema-generator is a devDependency; this module
    // is only ever loaded at build/test time, never bundled into the extension.
    const { createGenerator } = require('ts-json-schema-generator');
    const generator = createGenerator({
        path: target.source,
        tsconfig: path.join(ROOT, 'tsconfig.json'),
        type: target.typeName,
        skipTypeCheck: true,
        additionalProperties: true,
    });
    return generator.createSchema(target.typeName);
}

module.exports = { TARGETS, generateSchema };

if (require.main === module) {
    const fs = require('fs');
    for (const target of TARGETS) {
        const schema = generateSchema(target);
        fs.mkdirSync(path.dirname(target.output), { recursive: true });
        fs.writeFileSync(target.output, JSON.stringify(schema, null, 2) + '\n');
        console.log(
            `wrote ${path.relative(process.cwd(), target.output)} (${JSON.stringify(schema).length} bytes)`,
        );
    }
}
