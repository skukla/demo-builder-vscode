/**
 * `report_demo_builder_issue`: Report to Demo Builder (owner, 2026-11-19). When an SC's AI finds
 * the cause of a failure in Demo Builder itself, it does not change Demo Builder's code: it drafts a
 * GitHub issue, every demo detail taken out (`demoBuilderIssue.ts`), and opens it on GitHub's
 * new-issue page for the SC to read and submit. Nothing is posted on the SC's behalf, and no GitHub
 * permission is used. Requires confirm:true, as `open_url` does: it opens a browser page.
 *
 * Registered from `extension.ts`, which hands in the browser opener, the projects and the version,
 * so this module carries no vscode import.
 *
 * @module features/ai/server/reportIssueTool
 */

import { z } from 'zod';
import { issueUrl, knownNamesOf, publicWords } from './demoBuilderIssue';
import { asRawText, asText } from './mcpToolResult';
import type { McpToolServer } from './mcpToolServer';
import type { Project } from '@/types/base';

/** What the tool needs from the extension. */
export interface ReportIssueDeps {
    /** Opens a URL in the SC's browser. */
    openUrl: (url: string) => Promise<unknown>;
    /** Every project on disk, so their names can be taken out of the draft. */
    loadProjects: () => Promise<Project[]>;
    /** Demo Builder's version, for the report. */
    version: string;
}

/**
 * Register `report_demo_builder_issue`.
 *
 * @param server - the MCP server
 * @param deps - the browser opener, the projects, the version
 */
export function registerReportIssueTool(server: McpToolServer, deps: ReportIssueDeps): void {
    server.registerTool(
        'report_demo_builder_issue',
        {
            // Reads only the projects on disk and needs no sign-in: the SC submits on GitHub themselves.
            needsAuth: false,
            // NOT read-only: it opens a browser page the SC sees. Nothing is posted.
            annotations: { readOnlyHint: false, destructiveHint: false },
            title: 'Report to Demo Builder',
            description:
                'Report a problem in Demo Builder itself (a bug in the extension, not in the project ' +
                'or its storefront): opens a GitHub issue draft, with every project name, repository, ' +
                'site, store code, address and token taken out, for the user to read and submit. Use ' +
                "it instead of changing Demo Builder's own code. Nothing is posted until the user " +
                'submits it. Requires confirm:true — it opens a browser page; ask the user first.',
            // .strict(): a misspelt key would otherwise be dropped from the report.
            inputSchema: z
                .object({
                    title: z
                        .string()
                        .min(1)
                        .describe('A short title: what goes wrong, in plain words'),
                    whatFailed: z
                        .string()
                        .min(1)
                        .describe('What the user was doing and what failed'),
                    diagnosis: z
                        .string()
                        .min(1)
                        .describe('What you found: the cause in Demo Builder, and why'),
                    errorText: z
                        .string()
                        .optional()
                        .describe('The error as Demo Builder logged it'),
                    confirm: z
                        .boolean()
                        .optional()
                        .describe('Must be true — this opens a browser page; ask the user first'),
                })
                .strict(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: any) => {
            if (args?.confirm !== true) {
                return asRawText('report_demo_builder_issue requires confirm:true to proceed.', {
                    isError: true,
                });
            }
            const known = knownNamesOf(await deps.loadProjects(), await publicWords());
            const draft = {
                title: String(args.title),
                whatFailed: String(args.whatFailed),
                diagnosis: String(args.diagnosis),
                ...(typeof args.errorText === 'string' ? { errorText: args.errorText } : {}),
            };
            await deps.openUrl(issueUrl(draft, deps.version, known));
            return asText({
                opened: true,
                next: 'The draft is open on GitHub. Ask the user to read it and press Submit; nothing is posted until they do.',
            });
        },
    );
}
