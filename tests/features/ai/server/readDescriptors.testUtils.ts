/**
 * Shared accessors for the READ_DESCRIPTORS suites.
 *
 * All three suites reach into the catalog the same way — find the row for a
 * tool, then read its `shape` or its `inputSchema` off it — and each had written
 * its own non-null-asserting one-liner. The assertions differ; the way you get
 * hold of a row does not, and a row that has gone missing should fail on the
 * assertion rather than on `undefined is not an object`.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import type { ToolDescriptor } from '@/features/ai/server/toolDescriptors';
import type { HandlerResponse } from '@/types/handlers';

/** The catalog row for `tool`, or a failure naming the tool that is missing. */
export function descriptorFor(tool: string): ToolDescriptor {
    const row = READ_DESCRIPTORS.find((d) => d.tool === tool);
    if (!row) {
        throw new Error(
            `No READ_DESCRIPTORS row for "${tool}". Registered: ` +
                READ_DESCRIPTORS.map((d) => d.tool).join(', '),
        );
    }
    return row;
}

/** The row's response projector. Fails if the row declares none. */
export function shapeOf(tool: string): NonNullable<ToolDescriptor['shape']> {
    const { shape } = descriptorFor(tool);
    if (!shape) throw new Error(`"${tool}" declares no shape; it uses defaultShape.`);
    return shape;
}

/** The row's declared input schema. Fails if the row takes no arguments. */
export function schemaOf(tool: string): NonNullable<ToolDescriptor['inputSchema']> {
    const { inputSchema } = descriptorFor(tool);
    if (!inputSchema) throw new Error(`"${tool}" declares no inputSchema.`);
    return inputSchema;
}

/**
 * Shape a response and parse the JSON the projector returned.
 *
 * The return type is whatever `JSON.parse` gives back, deliberately: each tool
 * projects a different shape and there is no one interface to declare. Callers
 * assert on the fields they care about.
 */
export function shaped(tool: string, res: HandlerResponse, args: Record<string, unknown> = {}) {
    return JSON.parse(shapeOf(tool)(res, args));
}
