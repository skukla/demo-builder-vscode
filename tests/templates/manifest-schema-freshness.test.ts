/**
 * Generated-schema freshness — every committed schema the generator owns must
 * match what it produces from the CURRENT TypeScript interface.
 *
 * Without this, a generated schema is just one more unenforced copy: edit the
 * interface, forget to regenerate, and runtime validation checks yesterday's
 * shape. Three targets since the project-file contract (program plan step 01):
 * the project manifest, the exported project file, and the shared-demo
 * description file. On failure:
 *
 *   npm run generate:manifest-schema
 */

import * as fs from 'fs';

// Plain node module by design — the test uses the SAME generation config the
// script writes with, so they cannot diverge.
 
const { TARGETS, generateSchema } = require('../../scripts/generate-manifest-schema.js') as {
    TARGETS: SchemaTarget[];
    generateSchema: (target: SchemaTarget) => unknown;
};

interface SchemaTarget {
    typeName: string;
    source: string;
    output: string;
}

describe('generated schema freshness', () => {
    it('covers the three user-file targets', () => {
        expect(TARGETS.map((t) => t.typeName)).toEqual([
            'ProjectManifest',
            'ProjectFile',
            'SharedDemoDescription',
        ]);
    });

    describe.each(TARGETS.map((t): [string, SchemaTarget] => [t.typeName, t]))(
        '%s',
        (_name: string, target: SchemaTarget) => {
            it('committed schema matches a fresh generation from the interface', () => {
                const committed = JSON.parse(fs.readFileSync(target.output, 'utf-8'));
                const fresh = JSON.parse(JSON.stringify(generateSchema(target)));
                expect(committed).toEqual(fresh);
            });
        },
    );
});
