/**
 * The bundle's "Your MCP Servers" section.
 *
 * WHY IT EXISTS. Measured 2026-08-26 across five battery runs on three different
 * measurement rigs: the agent used `demo-builder` and `playwright` fluently and
 * opened `dropins` **zero times** — while doing, by hand, work `dropins` has
 * tools for.
 *
 * The reason is in how it searches. Every lookup was
 * `select:mcp__<server>__<exact-tool-name>` — searching BY NAME for tools it
 * already knows exist. It finds `playwright` because "browser" is a universal
 * idea and the tool name is guessable. `dropins` is not guessable: you have to
 * already know the package exists. A server nobody names is a server nobody uses,
 * however capable the agent is.
 *
 * The generated AGENTS.md named `demo-builder` four times and the other three
 * servers not once.
 *
 * The section is generated FROM `ai-defaults.json`, which already carries a
 * description and a `requires` gate per server, so it cannot drift from what is
 * actually installed.
 */

import { generateAgentsMd } from '@/features/project-creation/services/aiBundle/aiContextWriter';

import {
    STACKS,
    makeEdsProject,
    makeHeadlessProject,
} from './aiBundleFixtures';

// ─── Helpers (the parent suite's, copied so each spec stands alone) ──────────

describe('Your MCP Servers — the agent is told what it has', () => {
    it('names every server an EDS project actually gets', async () => {
        const md = await generateAgentsMd(makeEdsProject(), STACKS);

        expect(md).toContain('## Your MCP Servers');
        // The three the agent was never told about.
        expect(md).toContain('dropins');
        expect(md).toContain('playwright');
        expect(md).toContain('commerce-extensibility');
    });

    it("carries dropins' projectDir trap, which an agent gets wrong by default", async () => {
        // `ai-defaults.json` says it plainly: "Project-touching tools take a
        // required projectDir argument — pass the EDS storefront component path,
        // not the project root." Naming the server without that just moves the
        // failure one step later.
        const md = await generateAgentsMd(makeEdsProject(), STACKS);
        expect(md).toContain('projectDir');
    });

    it('does NOT name servers a headless project never receives', async () => {
        // `playwright` and `dropins` are gated on `eds-storefront`. Telling a
        // headless project about tools it does not have is worse than silence —
        // it sends the agent looking for something that is not there.
        const md = await generateAgentsMd(makeHeadlessProject(), STACKS);
        expect(md).not.toContain('mcp__dropins__');
        expect(md).not.toContain('@dropins/mcp');
    });
});
