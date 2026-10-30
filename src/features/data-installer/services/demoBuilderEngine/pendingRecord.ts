/**
 * A pending entry in the install record (step 14 item 1): a create sent, or about to be, whose
 * answer has not come back. Its own file so the record's file stays one job; `installRecord.ts`
 * holds and saves the entries, `pendingCreates.ts` writes them, `pendingFinders.ts` settles them.
 *
 * @module features/data-installer/services/demoBuilderEngine/pendingRecord
 */

import { z } from 'zod';

/**
 * A create sent, or about to be, whose answer has not come back (step 14 item 1): what a re-run or
 * a removal looks for in the store to tell whether it landed.
 */
export interface PendingObject {
    kind: string;
    /** The pack's name for it: a SKU, a code, an email, a name, `<path>@<scope>` for a setting. */
    key: string;
    /** Its id, when known before Commerce answers (a SKU, an attribute code, an assignment pair). */
    id?: string;
    /** What else finding it needs: a category's `parentId` and `name`, a customer's `websiteId`, a company's `email`. */
    find?: Record<string, string | number>;
    /** What the object is recorded with once made, known before the create (a stock's website, a company's admin). */
    previous?: unknown;
}

/** The entry as the record file holds it; optional on the record, so older records read unchanged. */
export const pendingSchema: z.ZodType<PendingObject> = z.object({
    kind: z.string(),
    key: z.string(),
    id: z.string().optional(),
    find: z.record(z.union([z.string(), z.number()])).optional(),
    previous: z.unknown().optional(),
});
