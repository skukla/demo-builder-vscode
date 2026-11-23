/**
 * The shape an install record on disk must have to be read (`installRecord.ts`), as a schema. A
 * record that fails it is refused, never half-read: a removal that misread one could delete what
 * the pack never made. Split out of `installRecord.ts`, beside `pendingRecord.ts`'s schema.
 *
 * @module features/data-installer/services/demoBuilderEngine/installRecordSchema
 */

import { z } from 'zod';
import { pendingSchema } from './pendingRecord';

export const recordSchema = z.object({
    format: z.literal(1),
    pack: z.object({ name: z.string(), version: z.string() }),
    engine: z.literal('demo-builder'),
    startedAt: z.string(),
    target: z.object({ websiteCode: z.string(), storeCode: z.string() }).optional(),
    aco: z.object({ tenantId: z.string(), region: z.string(), environment: z.enum(['sandbox', 'production']) }).optional(),
    instance: z.string().optional(),
    rootStep: z
        .object({
            state: z.enum(['open', 'done']),
            storeCode: z.string(),
            storeName: z.string(),
            rootId: z.number(),
            rootName: z.string(),
            storeRootId: z.number(),
            sharedWith: z.string(),
            note: z.string().optional(),
            lastCheck: z.enum(['passed', 'failed', 'unknown']).optional(),
        })
        .optional(),
    created: z.array(
        z.object({
            kind: z.string(),
            id: z.string(),
            previous: z.unknown().optional(),
            key: z.string().optional(),
            fingerprint: z.string().optional(),
            wrote: z.string().optional(),
            adopted: z.literal(true).optional(),
        }),
    ),
    pending: z.array(pendingSchema).optional(),
    behind: z.array(z.string()).optional(),
});
