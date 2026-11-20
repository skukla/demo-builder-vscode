/**
 * Commerce's Import API (`POST import/json`): many rows in one request, run inside it.
 *
 * Two things it does that callers must carry (ACCS sandbox, 2026-11-06):
 * - With `validation-skip-errors` it answers only "Entities Processed: N", and counts a refused row
 *   too (2 for one good row and one bad). What landed is read back, never taken from the answer.
 * - With `validation-stop-on-errors` a refused row is named, "Row 1: Value for 'material' attribute
 *   contains incorrect value…", and a row that passes is imported: it is not a dry run.
 *
 * ACCS takes the JSON form only (developer.adobe.com/commerce/webapi/rest/modules/import/).
 *
 * @module features/data-installer/services/demoBuilderEngine/importApi
 */

import type { CommerceSend } from '@/types/commerceWire';

/**
 * What the import does with its rows: `append` makes or updates products, `add_update` customers (the
 * behavior the service's `customers_export` sends, and the one that made a customer live, 2026-11-06),
 * `delete` removes them.
 */
export type ImportBehavior = 'append' | 'add_update' | 'delete';

/** How a refused row is treated: skipped with the rest going in, or stopping the call with its reason. */
export type ImportStrategy = 'validation-skip-errors' | 'validation-stop-on-errors';

/** The request body for these rows. Every row may be refused when skipping, so none stops the rest. */
export function importBody(
    entity: string,
    behavior: ImportBehavior,
    items: readonly unknown[],
    strategy: ImportStrategy = 'validation-skip-errors',
): unknown {
    return {
        source: {
            entity,
            behavior,
            validation_strategy: strategy,
            allowed_error_count: strategy === 'validation-skip-errors' ? String(items.length) : '0',
            items,
        },
    };
}

/** Commerce's words for a refused row ("Row 1: …"), from a stop-on-errors answer; undefined when it took the row. */
export function importRefusal(answer: unknown): string | undefined {
    const said = Array.isArray(answer)
        ? answer.filter((line): line is string => typeof line === 'string')
        : [];
    const refusal = said.find((line) => !/^Entities Processed:/iu.test(line));
    return refusal?.replace(/^Row \d+:\s*/u, '');
}

/** Import one row alone, stopping on its error: Commerce's reason when it refuses it, undefined when it took it. */
export async function importOneRow(
    send: CommerceSend,
    entity: string,
    row: unknown,
): Promise<string | undefined> {
    return importRefusal(
        await send(
            'POST',
            'import/json',
            importBody(entity, 'append', [row], 'validation-stop-on-errors'),
        ),
    );
}
