/**
 * What `tools/list` hands an agent for the six Adobe org/project/workspace tools.
 *
 * The schema block is not decoration: `needsAuth` drives the sign-in handoff the
 * server offers, `annotations.readOnlyHint` is what the dry run gates on, and
 * `inputSchema` is what the SDK validates arguments against before a handler ever
 * runs. A stub that discards the second argument of `registerTool` leaves all
 * three checked by nothing (see the `mcpToolServer.ts` docstring), so this suite
 * asserts them directly.
 *
 * Prose is asserted as PRESENT, not as exact text — the wording is meant to be
 * edited, the field is not.
 */

import { z } from 'zod';

import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import type { McpToolSchema } from '@/features/ai/server/mcpToolServer';

import { ctxFactoryWith, fakeServer, makeAuth } from './adobeTools.testUtils';

const ADOBE_TOOLS = [
    'list_orgs',
    'list_adobe_projects',
    'list_workspaces',
    'select_org',
    'select_project',
    'select_workspace',
];

function registered() {
    const server = fakeServer();
    registerAdobeTools(server, ctxFactoryWith(makeAuth()));
    return server;
}

/** The zod SHAPE a tool declares, as a parseable object schema. */
function schemaOf(def: McpToolSchema): z.ZodObject<z.ZodRawShape> {
    const input = def.inputSchema ?? {};
    return input instanceof z.ZodObject ? input : z.object(input as z.ZodRawShape);
}

describe('registerAdobeTools — registered schemas', () => {
    it('registers exactly the six Adobe org/project/workspace tools', () => {
        expect(registered().names()).toEqual(ADOBE_TOOLS);
    });

    describe.each(ADOBE_TOOLS)('%s', (name) => {
        const def = () => registered().definitionOf(name);

        // Every one of these reaches Adobe Console through an IMS token, so each
        // must pre-flight rather than error — an agent that is handed `needsAuth`
        // knows to call sign_in; one handed a 401 does not.
        it('declares Adobe sign-in as its prerequisite', () => {
            expect(def().needsAuth).toEqual(['adobe']);
        });

        // `select_*` included, deliberately: the target store is an in-memory
        // module variable, so nothing they write outlives the process. Marking
        // them destructive would stop an agent navigating for no safety gain.
        it('is annotated read-only and non-destructive', () => {
            expect(def().annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
        });

        it('carries a title and a description', () => {
            expect(def().title?.length ?? 0).toBeGreaterThan(0);
            expect(def().description.length).toBeGreaterThan(0);
        });
    });

    it('list_orgs and list_workspaces take no arguments', () => {
        const server = registered();
        for (const name of ['list_orgs', 'list_workspaces']) {
            expect(Object.keys(schemaOf(server.definitionOf(name)).shape)).toEqual([]);
        }
    });

    it('list_adobe_projects accepts search/limit/skip and defaults the page size to 20', () => {
        const schema = schemaOf(registered().definitionOf('list_adobe_projects'));

        expect(Object.keys(schema.shape).sort()).toEqual(['limit', 'search', 'skip']);
        // Paging is on by default — the untouched call must still be a page.
        expect(schema.parse({})).toEqual({ limit: 20 });
        expect(schema.parse({ search: 'x', limit: 5, skip: 2 })).toEqual({
            search: 'x',
            limit: 5,
            skip: 2,
        });
        // A description on each field is what tells the agent paging exists.
        for (const field of Object.values(schema.shape)) {
            expect((field.description ?? '').length).toBeGreaterThan(0);
        }
    });

    it.each([
        ['select_org', 'orgId'],
        ['select_project', 'projectId'],
        ['select_workspace', 'workspaceId'],
    ])('%s requires a %s string', (name, field) => {
        const schema = schemaOf(registered().definitionOf(name));

        expect(Object.keys(schema.shape)).toEqual([field]);
        expect(schema.safeParse({}).success).toBe(false);
        expect(schema.safeParse({ [field]: 42 }).success).toBe(false);
        expect(schema.parse({ [field]: 'an-id' })).toEqual({ [field]: 'an-id' });
        expect((schema.shape[field].description ?? '').length).toBeGreaterThan(0);
    });
});
