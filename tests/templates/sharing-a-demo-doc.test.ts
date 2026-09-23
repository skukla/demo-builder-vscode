/**
 * The sharing how-to (docs/systems/sharing-a-demo.md) is a published contract:
 * its field table names exactly the description file's fields, its example
 * validates against the schema, and the paths and files it tells a colleague
 * about are the ones the code reads. A how-to that drifts from the schema sends
 * a colleague to write a file that is then refused.
 */

import Ajv from 'ajv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CONTENT_INDEX_PATHS } from '@/features/eds/services/contentIndex';
import { CANONICAL_STOREFRONT_FILES } from '@/features/eds/services/storefront/repoStorefrontReadiness';
import { B2B_DROPINS } from '@/features/eds/services/storefront/sharedDemoProbe';
import { SHARED_DEMO_FILE_NAME } from '@/types/projectFile';
import schema from '@/core/state/config/shared-demo.schema.json';

const ROOT = join(__dirname, '..', '..');
const DOC = readFileSync(join(ROOT, 'docs/systems/sharing-a-demo.md'), 'utf8');

/** The `Field` column of the table under "The description file". */
function documentedFields(): string[] {
    const section = DOC.slice(DOC.indexOf('## The description file'), DOC.indexOf('## What is read when there is no file'));
    return [...section.matchAll(/^\| `([A-Za-z]+)` \|/gm)].map((m) => m[1]);
}

/** The fenced JSON example under the table. */
function example(): unknown {
    const fence = /```json\n([\s\S]*?)```/.exec(DOC);
    if (!fence) throw new Error('the how-to has no JSON example');
    return JSON.parse(fence[1]);
}

describe('the sharing how-to', () => {
    it('names every field of the description file, and no other', () => {
        const schemaFields = Object.keys(
            (schema as { definitions: { SharedDemoDescription: { properties: Record<string, unknown> } } }).definitions
                .SharedDemoDescription.properties,
        ).sort();
        expect(documentedFields().sort()).toEqual(schemaFields);
    });

    it('gives an example the schema accepts', () => {
        const ajv = new Ajv({ allErrors: true, strict: false });
        const validate = ajv.compile(schema);
        expect(validate(example())).toBe(true);
        expect(validate.errors ?? null).toBeNull();
    });

    it('names the file, the index paths and the storefront files the code reads', () => {
        expect(DOC).toContain(`\`${SHARED_DEMO_FILE_NAME}\``);
        for (const path of CONTENT_INDEX_PATHS) expect(DOC).toContain(`\`${path}\``);
        for (const file of CANONICAL_STOREFRONT_FILES) expect(DOC).toContain(`\`${file}\``);
        expect(DOC).toContain(`\`${B2B_DROPINS[0]}\``);
        expect(DOC).toContain(`and the other ${B2B_DROPINS.length - 1}`);
    });
});
