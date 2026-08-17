/**
 * `validate_component_selection` — "is this combination buildable?"
 *
 * One question, one tool. The wizard answers it with THREE handlers, because the
 * UI asks them at three different moments: `checkCompatibility` when the backend
 * changes, `loadDependencies` to populate the list, `validateSelection` when the
 * user commits. An agent has no such moments — it wants the verdict.
 *
 * Three descriptor rows would make that three round trips and three partial
 * answers the agent then has to reconcile, which is the same reasoning that made
 * `configure_project` one tool rather than five (see the phase-4 plan). Round
 * trips dominate; schema bytes do not.
 *
 * Registered directly rather than as a descriptor row because a row dispatches to
 * exactly one message type. Nothing here is new logic — it is the same three
 * dispatches the webview makes, against the same handler map.
 */

import { z } from 'zod';
import { dispatchHandler } from '@/core/handlers';
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** A dependency as `loadDependencies` returns it. */
interface DependencyRow {
    id: string;
    name?: string;
    required?: boolean;
    impact?: string;
}

/** `validateDependencyChain`'s result (`DependencyResolver.ts:100-104`). */
interface ChainValidation {
    valid?: boolean;
    errors?: string[];
    warnings?: string[];
}

function payloadOf(res: HandlerResponse): Record<string, unknown> {
    return (res.data ?? {}) as Record<string, unknown>;
}

export function registerValidateSelectionTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server: any,
    ctxFactory: () => HandlerContext,
): void {
    server.registerTool(
        'validate_component_selection',
        {
            description:
                'Can this frontend + backend be built together: compatibility, the dependencies the pair pulls in, and whether the resulting chain validates. Answers in one call what the wizard asks in three.',
            inputSchema: {
                frontend: z.string().describe('Frontend component id'),
                backend: z.string().describe('Backend component id'),
                dependencies: z
                    .array(z.string())
                    .optional()
                    .describe('Dependency ids already chosen; omit to validate the defaults'),
            },
        },
        async (args: { frontend: string; backend: string; dependencies?: string[] }) => {
            const { frontend, backend, dependencies = [] } = args;

            const run = (type: string, payload: Record<string, unknown>) =>
                dispatchHandler(projectCreationHandlers, ctxFactory(), type, payload);

            const compat = await run('checkCompatibility', { frontend, backend });
            if (!compat.success) {
                return text(`Error: ${String(compat.error ?? 'compatibility check failed')}`);
            }

            const compatible = Boolean(payloadOf(compat).compatible);

            // Stop here when the pair cannot be built. Resolving dependencies for
            // an impossible combination produces a list nobody can act on, and
            // the incompatibility is the whole answer.
            if (!compatible) {
                return text(
                    JSON.stringify({
                        compatible: false,
                        valid: false,
                        reason: `${frontend} and ${backend} are not compatible. Use list_components or get_component_requirements to find a compatible pair.`,
                    }),
                );
            }

            const deps = await run('loadDependencies', { frontend, backend });
            const rows = (payloadOf(deps).dependencies ?? []) as DependencyRow[];

            const validation = await run('validateSelection', {
                frontend,
                backend,
                dependencies,
            });
            const chain = payloadOf(validation) as ChainValidation;

            // Ids, not the full rows. `name`, `description` and `impact` are for a
            // wizard card; an agent acting on this needs the identifiers it would
            // pass to the next tool. get_component_requirements has the detail.
            return text(
                JSON.stringify({
                    compatible: true,
                    valid: chain.valid ?? false,
                    required: rows.filter((d) => d.required).map((d) => d.id),
                    optional: rows.filter((d) => !d.required).map((d) => d.id),
                    ...(chain.errors?.length ? { errors: chain.errors } : {}),
                    ...(chain.warnings?.length ? { warnings: chain.warnings } : {}),
                }),
            );
        },
    );
}

function text(body: string) {
    return { content: [{ type: 'text' as const, text: body }] };
}
