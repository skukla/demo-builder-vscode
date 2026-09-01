/**
 * Every tool must register against the REAL McpServer.
 *
 * WHY THIS EXISTS. `get_component_requirements` shipped with a raw JSON-Schema
 * `inputSchema` where the SDK requires zod (commit e26bd01e). The SDK throws
 * "inputSchema must be a Zod schema or raw shape" — inside `registerExtraTools`,
 * so it aborted registration for EVERY tool and left a server that bound its
 * socket and never answered a handshake. The whole agent surface was dead.
 *
 * Nothing offline saw it. Not tsc (the server parameter is `any`), not eslint,
 * and not the tool's own seven passing tests — because every suite here uses a
 * fake server whose `registerTool` ignores the schema argument:
 *
 *     registerTool: (name, _def, handler) => tools.set(name, handler)
 *                          ^^^^ the thing that was wrong
 *
 * That is the same failure as an invented fixture: the test agreed with the
 * implementation and neither agreed with the SDK. The fix is to hand the real
 * McpServer the real descriptors once, so a schema mistake fails here instead of
 * silently killing the server at activation.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAdobeResourceTools } from '@/features/ai/server/adobeResourceTools';
import { registerEventProviderTools } from '@/features/ai/server/eventProviderTools';
import { registerAdobeTools } from '@/features/ai/server/adobeTools';
import { registerApplyUpdatesTool } from '@/features/ai/server/applyUpdatesTool';
import { registerAuthTools } from '@/features/ai/server/authTools';
import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { registerComponentRequirementsTool } from '@/features/ai/server/componentRequirementsTool';
import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import { registerContentAuthoringTools } from '@/features/ai/server/contentAuthoringTools';
import { registerCreateProjectTool } from '@/features/ai/server/createProjectTool';
import { registerAgentTraceTool } from '@/features/ai/server/agentTraceTool';
import { registerCurrentProjectTool } from '@/features/ai/server/currentProjectTool';
import { registerDeleteProjectTool } from '@/features/ai/server/deleteProjectTool';
import { registerDiagnosticsTools } from '@/features/ai/server/diagnosticsTools';
import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';
import { registerEdsResetTool } from '@/features/ai/server/edsResetTool';
import { registerLifecycleTools } from '@/features/ai/server/lifecycleTools';
import { registerCommerceEndpointsTool } from '@/features/ai/server/commerceEndpointsTool';
import { registerCommerceQueryTool } from '@/features/ai/server/commerceQueryTool';
import { registerProjectStatusTool } from '@/features/ai/server/projectStatusTool';
import { registerSettingsTools } from '@/features/ai/server/settingsTools';
import { registerSiteTools } from '@/features/ai/server/siteTools';
import { registerStorefrontTools } from '@/features/ai/server/storefrontTools';
import { registerViewTools } from '@/features/ai/server/viewTools';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import { registerValidateSelectionTool } from '@/features/ai/server/validateSelectionTool';
import type { HandlerContext } from '@/types/handlers';
import type { McpToolServer } from '@/features/ai/server/mcpToolServer';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

/**
 * A REAL SDK server, handed over as our narrowed `McpToolServer`.
 *
 * The cast is unavoidable and is the sanctioned form — it NAMES the target. The
 * SDK's own `registerTool` is generic over its zod schema, and asking tsc to
 * structurally match that against our surface makes it give up with "type
 * instantiation is excessively deep". Casting once here keeps the point of this
 * file intact: every registration below still runs against the REAL SDK, which is
 * the only thing that catches a bad inputSchema at all.
 */
const server = () =>
    new McpServer({ name: 'test', version: '0.0.0' }) as unknown as McpToolServer;
const ctxFactory = () => ({ sendMessage: async () => {} }) as unknown as HandlerContext;
// The builder's `getCurrentProject` already resolves null, so there is nothing to override.
const stateManager = createMockStateManager();

describe('registration against the real MCP SDK', () => {
    it('accepts every descriptor row', () => {
        expect(() =>
            registerDescriptorTools(
                server(),
                [...READ_DESCRIPTORS, ...STATUS_DESCRIPTORS, ...ACTION_DESCRIPTORS],
                ctxFactory
            )
        ).not.toThrow();
    });

    it.each([
        ['get_component_requirements', (s: McpToolServer) => registerComponentRequirementsTool(s)],
        [
            'validate_component_selection',
            (s: McpToolServer) => registerValidateSelectionTool(s, ctxFactory),
        ],
        ['get_project_status', (s: McpToolServer) => registerProjectStatusTool(s, stateManager)],
        [
            'get_commerce_endpoints',
            (s: McpToolServer) => registerCommerceEndpointsTool(s, stateManager),
        ],
        ['discovery tools', (s: McpToolServer) => registerDiscoveryTools(s)],
        ['adobe resource tools', (s: McpToolServer) => registerAdobeResourceTools(s, ctxFactory)],
        [
            'event provider tools',
            (s: McpToolServer) => registerEventProviderTools(s, ctxFactory, () => ({}) as never),
        ],
        ['configure_project', (s: McpToolServer) => registerConfigureProjectTool(s, stateManager)],
        ['cloud resource tools', (s: McpToolServer) => registerCloudResourceTools(s, ctxFactory)],
    ])('accepts %s', (_name, register) => {
        expect(() => register(server())).not.toThrow();
    });

    // One server, everything on it — the arrangement extension.ts actually builds.
    // A duplicate tool name also throws here, which no per-module test can see.
    //
    // THIS LIST WAS HALF THE SURFACE (fixed 2026-08-17). It registered 8 functions
    // while `extension.ts` registers 17, and still claimed to be "as extension.ts
    // registers it" — so the duplicate-name safety net covered about half the
    // tools, and a collision between an omitted module and anything else would
    // have shipped. That is the same shape as the stub-server hole this file was
    // written for: a guard whose scope quietly stopped matching what it guards.
    //
    // The count assertion below is the part that keeps it honest — a new
    // `register*` call in extension.ts fails here until it is added.
    it('accepts the whole surface on ONE server, as extension.ts registers it', () => {
        const s = server();
        expect(() => {
            registerDescriptorTools(
                s,
                [...READ_DESCRIPTORS, ...STATUS_DESCRIPTORS, ...ACTION_DESCRIPTORS],
                ctxFactory
            );
            registerDiscoveryTools(s);
            registerDiagnosticsTools(s, '/tmp/nonexistent-log-dir');
            registerAuthTools(s, ctxFactory);
            registerAdobeTools(s, ctxFactory);
            registerCreateProjectTool(s, ctxFactory);
            registerCurrentProjectTool(s, ctxFactory);
            registerAgentTraceTool(
                s,
                { all: () => [], repeats: () => [] } as never,
                '/nonexistent-trace-dir',
            );
            registerProjectStatusTool(s, stateManager);
            registerCommerceEndpointsTool(s, stateManager);
            registerCommerceQueryTool(s, {} as never);
            registerValidateSelectionTool(s, ctxFactory);
            registerComponentRequirementsTool(s);
            registerAdobeResourceTools(s, ctxFactory);
            registerEventProviderTools(s, ctxFactory, () => ({}) as never);
            registerConfigureProjectTool(s, stateManager);
            registerCloudResourceTools(s, ctxFactory);
            registerStorefrontTools(s, ctxFactory);
            registerSiteTools(s, ctxFactory);
            registerSettingsTools(s, () => undefined);
            registerContentAuthoringTools(s, ctxFactory);
            registerEdsResetTool(s, ctxFactory);
            registerDeleteProjectTool(s, ctxFactory);
            registerApplyUpdatesTool(s, ctxFactory);
            registerViewTools(s, async () => undefined);
            registerLifecycleTools(s, ctxFactory, async () => undefined);
        }).not.toThrow();
    });

    /**
     * The list above must keep naming every `register*` call `extension.ts` makes.
     *
     * Asserted by READING extension.ts rather than by counting what registered,
     * because the failure being guarded is an omission — a function nobody calls
     * here registers nothing, so any count taken from this server would agree with
     * the mistake. Reading the source is the only place the two can disagree.
     */
    it('registers every register* call that extension.ts makes', async () => {
        const { readFileSync } = await import('fs');
        const extensionSource = readFileSync('src/extension.ts', 'utf8');
        const thisSuite = readFileSync(
            'tests/features/ai/server/realSdkRegistration.test.ts',
            'utf8'
        );

        const calls = [
            ...new Set(
                [...extensionSource.matchAll(/\b(register[A-Za-z]*Tools?)\s*\(/g)].map((m) => m[1])
            ),
        ].sort();

        // Control: a regex that matched nothing would make the loop below pass
        // whatever this suite covered.
        expect(calls.length).toBeGreaterThan(10);

        // `\s*` because the multi-argument calls wrap: `registerDescriptorTools(\n  s,`.
        // Matching the argument at all is what stops a name MENTIONED in a comment
        // from counting as covered.
        const uncovered = calls.filter(
            (name) => !new RegExp(`${name}\\(\\s*s[,)]`).test(thisSuite)
        );
        expect(uncovered).toEqual([]);
    });

    // The control. Without it, "does not throw" would pass even if the SDK
    // accepted anything at all — and then this suite would be decoration.
    it('control: the SDK DOES reject the shape that caused the outage', () => {
        expect(() =>
            server().registerTool(
                'raw_json_schema',
                {
                    needsAuth: false,
                    description: 'the e26bd01e mistake',

                    inputSchema: { componentId: { type: 'string' } } as any,
                },
                async () => ({ content: [] })
            )
        ).toThrow(/Zod schema or raw shape/);
    });
});
