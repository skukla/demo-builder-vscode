/**
 * The shape check every ACO kind passes before it is saved, as the Data Installer service checks
 * its own export (`validateTransformedData`, e.g. `AcoCatalogExportProcessor.js` L298-312). The
 * schemas are the service's files, copied verbatim into `config/aco-schemas/` (dsc-data-installer-api
 * 3ced647, `config/schemas/aco_<kind>.json`): its installer reads these packs, so its rules are
 * the ones that matter. The TypeScript types in `types/acoPack.ts` are the compile-time half.
 *
 * @module features/data-installer/services/acoExport/acoPackSchemas
 */

import Ajv, { type ValidateFunction } from 'ajv';
import categories from '../../config/aco-schemas/aco_categories.json';
import metadata from '../../config/aco-schemas/aco_metadata.json';
import priceBooks from '../../config/aco-schemas/aco_price_books.json';
import prices from '../../config/aco-schemas/aco_prices.json';
import products from '../../config/aco-schemas/aco_products.json';
import type { AcoExportKind, AcoPackRows } from '@/types/acoPack';

const SCHEMAS: Record<AcoExportKind, object> = {
    aco_metadata: metadata,
    aco_categories: categories,
    aco_products: products,
    aco_price_books: priceBooks,
    aco_prices: prices,
};

/** How many of the schema's complaints are named; the rest are counted. */
const NAMED_PROBLEMS = 3;

const compiled = new Map<AcoExportKind, ValidateFunction>();

function validatorFor(kind: AcoExportKind): ValidateFunction {
    let validate = compiled.get(kind);
    if (!validate) {
        // strict:false: the service's schemas carry `description` beside `$ref` and `if`, which
        // strict mode rejects; they are its files, kept as they are.
        validate = new Ajv({ allErrors: true, strict: false }).compile(SCHEMAS[kind]);
        compiled.set(kind, validate);
    }
    return validate;
}

/** What the service's schema refuses in these rows, in its words, or undefined when it takes them. */
export function acoRowsProblem<K extends AcoExportKind>(
    kind: K,
    rows: AcoPackRows[K],
): string | undefined {
    const validate = validatorFor(kind);
    if (validate(rows)) return undefined;
    const errors = validate.errors ?? [];
    const named = errors
        .slice(0, NAMED_PROBLEMS)
        .map((e) => `${e.instancePath || '/'} ${e.message ?? 'is not allowed'}`);
    const more =
        errors.length > NAMED_PROBLEMS ? ` (and ${errors.length - NAMED_PROBLEMS} more)` : '';
    return `${named.join('; ')}${more}`;
}
