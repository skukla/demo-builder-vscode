/**
 * Config ↔ interface contracts — bundled JSON validates against a schema
 * GENERATED from the TypeScript interface the code casts it to.
 *
 * The sibling suite (config-contracts.test.ts) validates data against the
 * hand-written *.schema.json; this one closes the remaining leg of the
 * triangle. Comparing the hand schema to the interface directly is
 * impractical (schema equivalence), so both are validated against the SAME
 * real data instead — they cannot then diverge anywhere the shipped data
 * exercises. This is the check the load-site `as unknown as` casts suppress
 * and that tsc structurally cannot perform (resolveJsonModule cannot produce
 * literal-union types).
 *
 * Day-one catches (2026-08-21): RawComponentRegistry required an `id` the raw
 * entries never carry (the record key is the id; the loader injects it),
 * missed the live `addons` section, and components.json carried two dead
 * sections (brands/stacks) nothing read.
 *
 * mesh-config.json has no dedicated interface; it is covered by the
 * hand-schema suite only.
 */

import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { createGenerator } from 'ts-json-schema-generator';

const ROOT = path.join(__dirname, '../..');

/** config file → the interface its load-site cast claims, and where it lives. */
const PAIRS: Array<[dataPath: string, typeName: string, sourceFile: string]> = [
    [
        'src/features/components/config/components.json',
        'RawComponentRegistry',
        'src/types/components.ts',
    ],
    [
        'src/features/components/config/demo-packages.json',
        'DemoPackagesConfig',
        'src/types/demoPackages.ts',
    ],
    ['src/features/components/config/stacks.json', 'StacksConfig', 'src/types/stacks.ts'],
    [
        'src/features/components/config/app-builder-components.json',
        'AppBuilderComponentsCatalog',
        'src/types/appBuilderComponents.ts',
    ],
    [
        'src/features/components/config/block-libraries.json',
        'BlockLibrariesConfig',
        'src/types/blockLibraries.ts',
    ],
    [
        'src/features/project-creation/config/ai-defaults.json',
        'AiDefaults',
        'src/types/aiDefaults.ts',
    ],
    [
        'src/features/project-creation/config/api-services.json',
        'ApiServicesConfig',
        'src/types/handlers.ts',
    ],
    [
        'src/features/prerequisites/config/prerequisites.json',
        'PrerequisitesConfig',
        'src/features/prerequisites/services/types.ts',
    ],
];

describe('config ↔ interface contracts', () => {
    it.each(PAIRS)('%s satisfies %s', (dataPath, typeName, sourceFile) => {
        const generator = createGenerator({
            path: path.join(ROOT, sourceFile),
            tsconfig: path.join(ROOT, 'tsconfig.json'),
            type: typeName,
            // The whole-project typecheck is tsc's job (and the gate's); this
            // suite only needs the type graph.
            skipTypeCheck: true,
            // Strict on purpose: an undeclared key in the data IS the finding
            // (dead config, or an interface that fell behind).
            additionalProperties: false,
        });
        const schema = generator.createSchema(typeName);

        const data = JSON.parse(fs.readFileSync(path.join(ROOT, dataPath), 'utf-8'));
        // Editor tooling pointer, not part of any interface.
        delete data.$schema;

        const ajv = new Ajv({ allErrors: true, strict: false });
        const valid = ajv.validate(schema, data);
        const errors = (ajv.errors ?? [])
            .map((e) => `${e.instancePath || '/'} ${e.message}`)
            .join('\n  ');
        expect(valid ? '' : errors).toBe('');
    });
});
