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
import { registerCloudResourceTools } from '@/features/ai/server/cloudResourceTools';
import { registerComponentRequirementsTool } from '@/features/ai/server/componentRequirementsTool';
import { registerConfigureProjectTool } from '@/features/ai/server/configureProjectTool';
import { registerDiscoveryTools } from '@/features/ai/server/discoveryTools';
import { registerProjectStatusTool } from '@/features/ai/server/projectStatusTool';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { registerDescriptorTools } from '@/features/ai/server/toolDescriptors';
import { registerValidateSelectionTool } from '@/features/ai/server/validateSelectionTool';
import type { StateManager } from '@/core/state';
import type { HandlerContext } from '@/types/handlers';

const server = () => new McpServer({ name: 'test', version: '0.0.0' });
const ctxFactory = () => ({ sendMessage: async () => {} }) as unknown as HandlerContext;
const stateManager = { getCurrentProject: async () => null } as unknown as StateManager;

describe('registration against the real MCP SDK', () => {
    it('accepts every descriptor row', () => {
        expect(() =>
            registerDescriptorTools(
                server(),
                [...READ_DESCRIPTORS, ...STATUS_DESCRIPTORS, ...ACTION_DESCRIPTORS],
                ctxFactory,
            ),
        ).not.toThrow();
    });

    it.each([
        ['get_component_requirements', (s: McpServer) => registerComponentRequirementsTool(s)],
        ['validate_component_selection', (s: McpServer) => registerValidateSelectionTool(s, ctxFactory)],
        ['get_project_status', (s: McpServer) => registerProjectStatusTool(s, stateManager)],
        ['discovery tools', (s: McpServer) => registerDiscoveryTools(s)],
        ['adobe resource tools', (s: McpServer) => registerAdobeResourceTools(s, ctxFactory)],
        ['configure_project', (s: McpServer) => registerConfigureProjectTool(s, stateManager)],
        ['cloud resource tools', (s: McpServer) => registerCloudResourceTools(s, ctxFactory)],
    ])('accepts %s', (_name, register) => {
        expect(() => register(server())).not.toThrow();
    });

    // One server, everything on it — the arrangement extension.ts actually builds.
    // A duplicate tool name also throws here, which no per-module test can see.
    it('accepts the whole surface on ONE server, as extension.ts registers it', () => {
        const s = server();
        expect(() => {
            registerDescriptorTools(
                s,
                [...READ_DESCRIPTORS, ...STATUS_DESCRIPTORS, ...ACTION_DESCRIPTORS],
                ctxFactory,
            );
            registerDiscoveryTools(s);
            registerProjectStatusTool(s, stateManager);
            registerValidateSelectionTool(s, ctxFactory);
            registerComponentRequirementsTool(s);
            registerAdobeResourceTools(s, ctxFactory);
            registerCloudResourceTools(s, ctxFactory);
            registerConfigureProjectTool(s, stateManager);
        }).not.toThrow();
    });

    // The control. Without it, "does not throw" would pass even if the SDK
    // accepted anything at all — and then this suite would be decoration.
    it('control: the SDK DOES reject the shape that caused the outage', () => {
        expect(() =>
            server().registerTool(
                'raw_json_schema',
                {
                    description: 'the e26bd01e mistake',
                     
                    inputSchema: { componentId: { type: 'string' } } as any,
                },
                async () => ({ content: [] }),
            ),
        ).toThrow(/Zod schema or raw shape/);
    });
});
