/**
 * Diagnosis tools — "why is this not working?" (Phase 4, Group 1).
 *
 * Separate from `readDescriptors` because that file is at 428 lines and this
 * group is a different job: those reads answer *what exists*, these answer
 * *what is wrong*. They are the tools an agent reaches for when publishing
 * silently fails or a repo will not serve a storefront, which today has no
 * answer on the agent surface at all.
 *
 * Every row here dispatches to a handler the wizard already calls. What each row
 * had to establish first — and what a name alone will not tell you:
 *
 * - Does it survive with no `panel`? `handleRequestStatus` does not; it returns
 *   "No panel available" before doing anything (`statusHandlers.ts:54`), which is
 *   why `get_project_status` is built over the service instead and is not here.
 * - Does it RETURN its answer, or send it? `handleDiscoverStoreStructure` sends.
 * - Does the read write anything? `checkGitHubApp` does, on one branch.
 */

import { z } from 'zod';
import { needsUser } from './handoff';
import type { ToolDescriptor } from './toolDescriptors';
import { prerequisitesHandlers } from '@/features/prerequisites/handlers/prerequisitesHandlers';
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';

/** Owner/repo, shared by both GitHub-side checks. */
const REPO = {
    owner: z.string().describe('GitHub owner (user or org)'),
    repo: z.string().describe('GitHub repository name'),
};

export const STATUS_DESCRIPTORS: ToolDescriptor[] = [
    {
        tool: 'check_prerequisites',
        description:
            'Check the tools a stack needs (Node versions, aio CLI, plugins) and whether each is installed. Requires a stack id from list_stacks.',
        map: prerequisitesHandlers,
        type: 'check-prerequisites',
        inputSchema: {
            // REQUIRED, and not merely for convenience. `getNodeVersionMapping`
            // returns `{}` when `sharedState.currentComponentSelection` is unset
            // (`shared.ts:268-270`), which only `selectedStack` populates. With an
            // empty mapping `checkNodePrerequisite` takes its "no components need
            // Node" branch and reports Node as **installed: true** — a silent pass
            // on the prerequisite most likely to be missing. Same class as the
            // Group 0b defect, one layer in.
            selectedStack: z
                .string()
                .describe(
                    'Stack id from list_stacks, e.g. eds-accs. Determines which Node versions are checked',
                ),
            selectedOptionalDependencies: z
                .array(z.string())
                .optional()
                .describe(
                    'Optional dependency ids the project actually uses — mesh component ids, e.g. eds-accs-mesh',
                ),
            isRecheck: z
                .boolean()
                .optional()
                .describe('Clear the cache and re-run every check from scratch'),
        },
        // Dispatch-only: the handler pushes its answer and returns a bare
        // `{success: true}` (`checkHandler.ts:448`). The completion event carries
        // `allInstalled` plus a per-prerequisite summary.
        capturePayloadFrom: 'prerequisites-complete',
    },
    {
        tool: 'check_github_app',
        description:
            'Is the AEM Code Sync GitHub App installed on a repo. First thing to check when EDS publishing silently fails.',
        map: projectCreationHandlers,
        type: 'check-github-app',
        inputSchema: REPO,
        // WRITE-IN-A-READ GUARD. On an HTTP 404 from Helix the handler triggers a
        // code sync against the repo and waits for it (`checkGitHubAppHandler.ts:207`).
        // That is a reasonable thing for the wizard to do mid-setup and a wrong
        // thing for a tool named `check_`: an agent enumerating checks would fire
        // syncs at every repo it asked about. `skipTrigger` is the handler's own
        // opt-out, already used by the selection-time check.
        argDefaults: { skipTrigger: true },
    },
    {
        tool: 'check_repo_readiness',
        description:
            'Can this GitHub repo serve as an EDS storefront. Returns a readiness verdict, or "undetermined" with a reason.',
        map: projectCreationHandlers,
        type: 'check-repo-readiness',
        inputSchema: REPO,
        // Returns `{success, readiness}` directly — no capture needed.
        // `undetermined` is a distinct verdict from "not ready" and the handler
        // keeps them apart, so neither the shape nor the agent should collapse them.
    },
    {
        tool: 'discover_store_structure',
        description:
            'Fetch the LIVE Commerce store hierarchy (websites, stores, store views). Use before setting store scope; get_store_structure only reads what was already saved.',
        map: projectCreationHandlers,
        type: 'discover-store-structure',
        inputSchema: {
            // `backendType` is REQUIRED — the handler rejects the call without it
            // (`edsHandlers.ts:89`). An earlier draft of this row guessed
            // `environmentType` from the tool's name and shipped a tool that failed
            // every call; the live probe caught it on the first invocation.
            backendType: z
                .enum(['accs', 'paas'])
                .describe('Commerce backend: accs (Adobe Commerce as Cloud Service) or paas'),
            baseUrl: z.string().describe('Commerce base URL (PaaS) or ACCS API base URL'),
            orgId: z.string().optional().describe('ACCS only: IMS org ID'),
            accsGraphqlEndpoint: z
                .string()
                .optional()
                .describe('ACCS only: GraphQL endpoint, used to extract the tenant ID'),
        },
        // PaaS discovery authenticates with an admin USERNAME AND PASSWORD carried
        // in the payload (`edsHandlers.ts:118-127`). A tool argument is the wrong
        // place for a credential — it lands in the transcript and in whatever logs
        // the agent keeps — so this refuses the branch instead of dispatching with
        // blanks and surfacing the service's credential rejection.
        //
        // ACCS needs no secret: `buildAccsDiscoveryParams` resolves the IMS token
        // from context. That branch dispatches normally.
        preflight: (args) =>
            args.backendType === 'paas'
                ? needsUser({
                      reason: 'secret-entry',
                      what: 'Enter the Commerce admin username and password',
                      where: { command: 'demoBuilder.configureProject' },
                      tellUser:
                          'PaaS store discovery signs in with your Commerce admin credentials. ' +
                          'Open Configure Project in Demo Builder and enter them there — they must not be ' +
                          'sent through the agent. Discovery runs from that screen once they are saved.',
                      resumeWith: 'get_store_structure',
                  })
                : undefined,
        // This handler REPORTS BY SENDING and returns `{success: true}` even when
        // discovery failed — the comment at `edsHandlers.ts:153` says so outright:
        // "Handler succeeded, discovery failed". Without the capture this tool
        // would answer "{}" for every call, success and failure alike.
        //
        // `runHandler` gives a captured `success: false` precedence over the
        // handler's `true` for exactly this row.
        capturePayloadFrom: 'store-discovery-result',
    },
];
