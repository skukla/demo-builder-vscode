/**
 * READ_DESCRIPTORS as a TABLE — every row's auth requirement, read-only claim
 * and declared argument names, pinned in one place.
 *
 * WHY A TABLE AND NOT PROSE ASSERTIONS. Each of these fields is consumed by
 * something that cannot see the row: `needsAuth` drives the guard chain before
 * dispatch, `readOnly` becomes the SDK's `readOnlyHint` annotation an agent uses
 * to decide whether a call needs consent, and `inputSchema` is what the SDK
 * parses arguments against — a row that declares no argument is dispatched `{}`,
 * which is exactly how `check_mesh` shipped broken. None of the three fails
 * loudly when it is wrong; the tool simply behaves as a different tool.
 *
 * So the table is the specification and the row is checked against it. A new
 * read tool fails here until it is listed, which is the point.
 */

import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { aiHandlers } from '@/features/dashboard/handlers/aiHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import type { HandlerMap } from '@/types/handlers';

interface Row {
    tool: string;
    map: HandlerMap;
    type: string;
    needsAuth: false | string[];
    /** Declared argument names, or null for a row that takes none. */
    args: string[] | null;
}

const CATALOG: Row[] = [
    {
        tool: 'verify_ai_setup',
        map: aiHandlers,
        type: 'verify-ai-setup',
        needsAuth: false,
        args: ['inventory'],
    },
    {
        tool: 'list_ai_prompts',
        map: aiHandlers,
        type: 'list-ai-prompts',
        needsAuth: false,
        args: ['promptId'],
    },
    {
        tool: 'check_mesh',
        map: meshHandlers,
        type: 'check-api-mesh',
        needsAuth: ['adobe'],
        args: ['workspaceId'],
    },
    {
        tool: 'get_integration_install_status',
        map: dashboardHandlers,
        type: 'getAppBuilderInstallStatus',
        needsAuth: false,
        args: ['id'],
    },
    {
        tool: 'list_console_apis',
        map: dashboardHandlers,
        type: 'listConsoleApis',
        needsAuth: ['adobe'],
        args: ['search'],
    },
    {
        tool: 'get_store_structure',
        map: edsHandlers,
        type: 'get-store-structure',
        needsAuth: ['commerce'],
        args: null,
    },
    {
        tool: 'get_project_urls',
        map: dashboardHandlers,
        type: 'getProjectUrls',
        needsAuth: false,
        args: null,
    },
    {
        tool: 'check_datapack_service',
        map: dataInstallerHandlers,
        type: 'check-datapack-service',
        needsAuth: ['adobe'],
        args: null,
    },
    {
        tool: 'find_datapacks',
        map: dataInstallerHandlers,
        type: 'find-datapacks',
        needsAuth: ['adobe'],
        args: ['includeCommunity', 'limit', 'skip'],
    },
    {
        tool: 'get_datapack',
        map: dataInstallerHandlers,
        type: 'get-datapack-detail',
        needsAuth: ['adobe'],
        args: ['datapackName', 'version'],
    },
    {
        tool: 'list_datapack_data_types',
        map: dataInstallerHandlers,
        type: 'list-datapack-data-types',
        needsAuth: ['adobe'],
        args: ['operationMode'],
    },
    {
        tool: 'list_installed_datapacks',
        map: dataInstallerHandlers,
        type: 'list-installed-datapacks',
        needsAuth: ['adobe'],
        args: ['commerceInstance', 'datapackName', 'limit', 'skip'],
    },
    {
        tool: 'get_datapack_activity',
        map: dataInstallerHandlers,
        type: 'get-datapack-activity',
        needsAuth: ['adobe'],
        args: ['datapackName', 'commerceInstance', 'operationMode', 'limit', 'skip'],
    },
];

describe('READ_DESCRIPTORS catalog', () => {
    // An empty row (`{}` where a descriptor should be) registers a tool with no
    // name and no handler, and nothing downstream complains — so the identity of
    // every row is pinned, not just its count.
    it('registers exactly these tools, in this order', () => {
        expect(READ_DESCRIPTORS.map((d) => d.tool)).toEqual(CATALOG.map((r) => r.tool));
    });

    describe.each(CATALOG.map((r) => [r.tool, r] as const))('%s', (tool, row) => {
        const descriptor = () => READ_DESCRIPTORS.find((d) => d.tool === tool)!;

        it('dispatches to the declared handler map and type', () => {
            expect(descriptor().map).toBe(row.map);
            expect(descriptor().type).toBe(row.type);
        });

        // `needsAuth: false` and `needsAuth: ['adobe']` are different guard
        // chains, and the difference between them is a tool that prompts for a
        // sign-in it does not need or one that calls Adobe without a token.
        it('requires exactly the declared authentication', () => {
            expect(descriptor().needsAuth).toEqual(row.needsAuth);
        });

        // readOnly drives the SDK's readOnlyHint. A read tool that reports
        // itself writable is asked for consent it should never need.
        it('declares itself read-only', () => {
            expect(descriptor().readOnly).toBe(true);
        });

        it('declares exactly the arguments the table names', () => {
            const schema = descriptor().inputSchema;
            expect(schema === undefined ? null : Object.keys(schema)).toEqual(row.args);
        });
    });
});
