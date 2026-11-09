/**
 * AiCapabilitiesModal Tests
 *
 * The capability catalog reached from the dashboard's "View AI Capabilities" link:
 * a lean two-section modal showing what the AI can do in this project — skills
 * (markdown procedural guides) and MCPs (programmatic tool servers). Empty and
 * error states use plain language. Footer carries a Regenerate AI files action.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiCapabilitiesModal } from '@/features/dashboard/ui/components/AiCapabilitiesModal';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { SkillInventoryEntry, McpInventoryEntry } from '@/types/ai';
import '@testing-library/jest-dom';

const SKILLS: SkillInventoryEntry[] = [
    {
        name: 'Add a component',
        description: 'Adds a component to your project',
        path: '/p/.claude/skills/add-component.md',
        source: 'demo-builder',
    },
    {
        name: 'Sync changes',
        description: null,
        path: '/p/.claude/skills/sync-changes.md',
        source: 'demo-builder',
    },
];

const MCPS: McpInventoryEntry[] = [
    {
        id: 'demo-builder',
        status: 'ok',
        tools: [
            { name: 'list_projects', description: 'List Demo Builder projects' },
            { name: 'get_project', description: 'Read project state' },
        ],
    },
    {
        id: 'playwright',
        status: 'ok',
        tools: [
            { name: 'browser_navigate', description: 'Navigate' },
            { name: 'browser_snapshot', description: 'Snapshot' },
            { name: 'browser_take_screenshot', description: 'Screenshot' },
        ],
    },
];

function renderModal(props: Partial<React.ComponentProps<typeof AiCapabilitiesModal>> = {}) {
    const onClose = jest.fn();
    const onRegenerate = jest.fn();
    render(
        <Provider theme={defaultTheme}>
            <AiCapabilitiesModal
                skills={props.skills ?? []}
                mcps={props.mcps ?? []}
                onClose={onClose}
                onRegenerate={onRegenerate}
                hasSkillsError={props.hasSkillsError}
                hasMcpsError={props.hasMcpsError}
                isLoading={props.isLoading}
                isBusy={props.isBusy}
                progress={props.progress}
                editedFiles={props.editedFiles}
                gatedSkills={props.gatedSkills}
                errorMessage={props.errorMessage}
            />
        </Provider>
    );
    return { onClose, onRegenerate };
}

describe('AiCapabilitiesModal', () => {
    beforeEach(() => jest.clearAllMocks());

    // ─── Skills section ──────────────────────────────────────────────────────
    // Detailed skills-list behavior (grouping, disclosure, sorting) lives in
    // AiSkillsList.test.tsx; this suite only checks integration into the modal.

    // Adobe ships an MCP server and its matching skill set as one integration,
    // and the modal used to split every pair across two sections — which is how
    // a storefront project running the App Builder pair, and no storefront pair
    // at all, stayed invisible (AI-1m, AI-1o).
    it('groups each MCP server with its own skill set', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });

        const section = screen.getByTestId('ai-integration-demo-builder');
        expect(section).toHaveTextContent('Demo Builder MCP');
        // Scoped: each section renders its OWN pair of lists, so an unscoped
        // query matches every section at once.
        expect(within(section).getByTestId('ai-mcps-list')).toBeInTheDocument();
        expect(within(section).getByTestId('ai-skills-list')).toBeInTheDocument();
    });

    it('shows a pair that is missing its skills as a section with only the server', () => {
        renderModal({
            skills: SKILLS,
            mcps: [...MCPS, { id: 'dropins', status: 'ok', tools: [] }],
        });

        // The storefront half exists as a server with no skill set beside it —
        // the exact shape of the AI-1m bug, now readable off the screen.
        const storefront = screen.getByTestId('ai-integration-storefront');
        expect(storefront).toHaveTextContent('Dropins MCP');
        // Assert the ABSENCE of a skill row, not of a label string — a label
        // that no longer exists makes this pass whether skills are there or
        // not, which is what the previous wording had quietly become.
        expect(within(storefront).queryAllByTestId('ai-skill-row')).toHaveLength(0);
        expect(within(storefront).queryByTestId('ai-skills-list')).not.toBeInTheDocument();
        // Nor the "no skills installed" line: that copy answers a question about
        // the PROJECT, and printing it inside one pair would say the project has
        // no skills while another section lists them.
        expect(within(storefront).queryByTestId('ai-skills-empty')).not.toBeInTheDocument();
    });

    // The mirror of the case above — a skill set whose server is not wired. It
    // reads as the same kind of gap, and the section must not answer for the
    // missing half by rendering an empty MCP list or the "none wired" line,
    // which speaks for the whole project.
    it('shows a pair that is missing its server as a section with only the skills', () => {
        renderModal({ skills: SKILLS, mcps: [MCPS[1]] });

        const demoBuilder = screen.getByTestId('ai-integration-demo-builder');
        expect(within(demoBuilder).getByTestId('ai-skills-list')).toBeInTheDocument();
        expect(within(demoBuilder).queryByTestId('ai-mcps-list')).not.toBeInTheDocument();
        expect(within(demoBuilder).queryByTestId('ai-mcps-empty')).not.toBeInTheDocument();
    });

    it('surfaces every skill name at rest (flat list — no accordions to jump the modal)', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.getByText('Add a component')).toBeInTheDocument();
        expect(screen.getByText('Sync changes')).toBeInTheDocument();
    });

    it('frames the surface via its section anchors alone (no subtitle line)', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        // The "What the AI can do…" subtitle was removed (2026-07-09) — the
        // title + section headings carry the framing.
        expect(screen.queryByText(/what the ai can do/i)).not.toBeInTheDocument();
        expect(screen.getAllByTestId('ai-integration-heading').length).toBeGreaterThan(0);
    });

    it('says each half of a pair in one plain line, with no middle dot', () => {
        // Owner, 2026-10-22: "Demo Builder MCP, 168 tools" over "Demo Builder
        // skills, 16" was noise. The server is one line saying what the number
        // means; the skills are a "Skills" heading over their names, with no count of a list the
        // SC can see (the dialog design rules' cut list).
        renderModal({ skills: SKILLS, mcps: MCPS });

        const section = screen.getByTestId('ai-integration-demo-builder');
        expect(section).toHaveTextContent('Demo Builder MCP: 2 tools your AI can call');
        expect(within(section).getByTestId('ai-skills-group-demo-builder')).toHaveTextContent(
            /^Skills$/
        );
    });

    it('prints no middle dot anywhere in the sectioned body', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            editedFiles: ['AGENTS.md'],
            gatedSkills: [{ file: 'eds-publish.md', toolId: 'publish_eds', reason: 'tool-missing' }],
        });

        // Positive control: the body rendered the lists it is searched for.
        expect(screen.getAllByTestId('ai-skill-row').length).toBeGreaterThan(0);
        expect(screen.getByTestId('ai-capabilities-columns').textContent).not.toContain('·');
        expect(screen.getByTestId('ai-edited-files-note').textContent).not.toContain('·');
    });

    it('prints no middle dot in the flat body either', () => {
        renderModal({ skills: SKILLS, mcps: [] });

        expect(screen.getByTestId('ai-mcps-heading')).toHaveTextContent(/^MCP Servers$/);
        expect(screen.getByTestId('ai-capabilities-columns').textContent).not.toContain('·');
    });

    it('places both sections in the two-column body', () => {
        // The body was a single tall column that cut its own list off; the
        // columns element is what the stylesheet test constrains.
        renderModal({ skills: SKILLS, mcps: MCPS });

        const columns = screen.getByTestId('ai-capabilities-columns');
        expect(columns).toContainElement(screen.getByTestId('ai-integration-demo-builder'));
    });

    it('shows a plain-language empty state for skills when none are installed', () => {
        renderModal({ skills: [], mcps: MCPS });
        expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
        // …in the FLAT body, which is the only place that copy can be reached
        // from. A sectioned view renders its skills list only inside a section
        // that HAS skills, so with none it would show no empty state at all —
        // the "MCP servers" heading is what says which body is on screen.
        expect(screen.getByTestId('ai-mcps-heading')).toBeInTheDocument();
    });

    it('shows an error row when the skill inspector errored', () => {
        renderModal({ skills: [], mcps: MCPS, hasSkillsError: true });
        expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
    });

    // ─── MCPs section ────────────────────────────────────────────────────────

    it('lists each MCP server under its display label', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        // Scoped by testid: "Demo Builder" also appears as a skills group header.
        expect(screen.getByTestId('ai-mcp-demo-builder')).toHaveTextContent('Demo Builder MCP');
        expect(screen.getByTestId('ai-mcp-playwright')).toHaveTextContent('Playwright MCP');
    });

    it('shows the tool count for each healthy MCP', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        // demo-builder has 2 tools, playwright has 3 tools
        expect(screen.getByTestId('ai-mcp-demo-builder')).toHaveTextContent(/2 tools/i);
        expect(screen.getByTestId('ai-mcp-playwright')).toHaveTextContent(/3 tools/i);
    });

    it('shows a plain-language empty state for MCPs when none are wired', () => {
        renderModal({ skills: SKILLS, mcps: [] });
        expect(screen.getByTestId('ai-mcps-empty')).toBeInTheDocument();
    });

    it('shows an error row when the MCP inspector errored', () => {
        renderModal({ skills: SKILLS, mcps: [], hasMcpsError: true });
        expect(screen.getByTestId('ai-mcps-error')).toBeInTheDocument();
    });

    it('flags MCP Servers that timed out during inspection', () => {
        const stuck: McpInventoryEntry[] = [{ id: 'slow-server', status: 'timeout' }];
        renderModal({ skills: SKILLS, mcps: stuck });
        expect(screen.getByTestId('ai-mcp-slow-server')).toHaveTextContent(/timed out|timeout/i);
    });

    it('flags MCP Servers that errored during inspection', () => {
        const broken: McpInventoryEntry[] = [
            { id: 'broken-server', status: 'error', error: 'boom' },
        ];
        renderModal({ skills: SKILLS, mcps: broken });
        expect(screen.getByTestId('ai-mcp-broken-server')).toHaveTextContent(/error|failed/i);
    });

    // ─── Edited files — what Regenerate keeps (ADR-013) ──────────────────────
    // Hash-and-skip means user-edited bundle files survive regenerates. Owner,
    // 2026-10-22: that fact matters only for Regenerate, so it is ONE quiet
    // sentence beside that button, not a line above the "Demo Builder" heading
    // and not a flag on each skill row. It names every edited file the verify
    // found (skills by their title), however many.

    it('says which edits Regenerate keeps, in one sentence below the lists', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, editedFiles: ['AGENTS.md'] });

        const note = screen.getByTestId('ai-edited-files-note');
        expect(note).toHaveTextContent(/^Regenerate keeps your edits to AGENTS\.md\.$/);
        // Not at the top: outside the scrolling lists, after them.
        expect(screen.getByTestId('ai-capabilities-columns')).not.toContainElement(note);
        expect(
            screen
                .getByTestId('ai-capabilities-columns')
                .compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
    });

    it('names several edited files in one sentence', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, editedFiles: ['.mcp.json', 'AGENTS.md'] });

        expect(screen.getByTestId('ai-edited-files-note')).toHaveTextContent(
            /^Regenerate keeps your edits to \.mcp\.json and AGENTS\.md\.$/
        );
    });

    it('names an edited skill by its title, in the same sentence', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            editedFiles: ['.claude/skills/add-component.md', '.mcp.json', 'AGENTS.md'],
        });

        expect(screen.getByTestId('ai-edited-files-note')).toHaveTextContent(
            /^Regenerate keeps your edits to the Add a component skill, \.mcp\.json and AGENTS\.md\.$/
        );
        // …and no longer as a flag on the row.
        expect(screen.queryByTestId('ai-skill-edited-flag')).not.toBeInTheDocument();
        for (const row of screen.getAllByTestId('ai-skill-row')) {
            expect(row).not.toHaveTextContent(/edited/i);
        }
    });

    it('falls back to the path for an edited skill file no listed skill owns', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, editedFiles: ['.claude/skills/gone/SKILL.md'] });

        expect(screen.getByTestId('ai-edited-files-note')).toHaveTextContent(
            /^Regenerate keeps your edits to \.claude\/skills\/gone\/SKILL\.md\.$/
        );
    });

    it('omits the sentence entirely when nothing is edited', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, editedFiles: [] });
        expect(screen.queryByTestId('ai-edited-files-note')).not.toBeInTheDocument();
    });

    it('omits the sentence when editedFiles is not supplied (pre-ADR project)', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.queryByTestId('ai-edited-files-note')).not.toBeInTheDocument();
    });

    it('omits the sentence while busy (the body is the loading state)', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true, editedFiles: ['AGENTS.md'] });
        expect(screen.queryByTestId('ai-edited-files-note')).not.toBeInTheDocument();
    });

    // ─── Regenerate failure surfacing ────────────────────────────────────────
    // A failed regenerate (handler {success:false, error} or a rejected
    // request) lands in the hook's aiRegenError; the title says it failed and
    // the reason sits under it, so the failure isn't a silent return to idle.

    it('says a failed regenerate in the title, in red, with the reason in the body', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            errorMessage: 'Failed to install AI tooling dependencies: npm exploded',
        });
        expect(screen.getByText("Couldn't Regenerate AI Files")).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).not.toBeNull();
        expect(screen.getByTestId('ai-regen-error')).toHaveTextContent(
            'Failed to install AI tooling dependencies: npm exploded'
        );
    });

    it('omits the error line and the status when errorMessage is absent', () => {
        renderModal({ skills: SKILLS, mcps: MCPS });
        expect(screen.queryByTestId('ai-regen-error')).not.toBeInTheDocument();
        expect(screen.getByText('AI Capabilities')).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).toBeNull();
    });

    it('does not say the last failure while busy: the regenerate running again is not that one', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true, errorMessage: 'boom' });
        expect(screen.queryByTestId('ai-regen-error')).not.toBeInTheDocument();
        expect(screen.getByText('AI Capabilities')).toBeInTheDocument();
        expect(document.querySelector('.modal-status-icon')).toBeNull();
    });

    // ─── Actions ─────────────────────────────────────────────────────────────

    it('fires onRegenerate when "Regenerate AI Files" is pressed', () => {
        const { onRegenerate } = renderModal({ skills: SKILLS, mcps: MCPS });
        fireEvent.click(screen.getByRole('button', { name: /regenerate ai files/i }));
        expect(onRegenerate).toHaveBeenCalledTimes(1);
    });

    it('does not offer Regenerate while a verify/regenerate operation is busy', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        expect(screen.queryByRole('button', { name: /^regenerate ai files$/i })).not.toBeInTheDocument();
    });

    // The wait is the visible cause (next test), so the button keeps its label: one spinner per
    // wait, and no "-ing" label (owner, 2026-10-31).

    it("is the Modal's wait while busy: the spinner and the way out, no lists", () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Run in Background' })).toBeInTheDocument();
        // isBusy is set during BOTH verify-ai-setup (every dashboard mount and every open) and
        // regenerate-ai-files before its first step: the wait says the check, never a regenerate's
        // step. The old "Reinstalling storefront dependencies" was specific to regen and misled.
        expect(screen.getByText('Checking the AI setup')).toBeInTheDocument();
        expect(screen.queryByText(/reinstalling/i)).not.toBeInTheDocument();
        expect(screen.queryByTestId('ai-mcps-list')).not.toBeInTheDocument();
        expect(screen.queryByTestId('ai-skills-summary')).not.toBeInTheDocument();
    });

    it('is the same wait while the inventory is first read: nothing counted, nothing offered', () => {
        renderModal({ isLoading: true });
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
        expect(screen.getByText('Checking the AI setup')).toBeInTheDocument();
        expect(screen.queryByTestId('ai-mcps-heading')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^regenerate ai files$/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('never tells you to regenerate files it has not looked at', () => {
        renderModal({ isLoading: true });
        expect(screen.queryByTestId('ai-mcps-empty')).not.toBeInTheDocument();
        expect(screen.queryByTestId('ai-skills-empty')).not.toBeInTheDocument();
        expect(screen.queryByText(/Regenerate AI Files/i)).not.toBeInTheDocument();
    });

    it('shows the lists when the modal is not busy', () => {
        renderModal({ skills: SKILLS, mcps: MCPS, isBusy: false });
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        // Body content present
        const section = screen.getByTestId('ai-integration-demo-builder');
        expect(within(section).getByTestId('ai-mcps-list')).toBeInTheDocument();
    });

    // ─── Live progress reporting ──────────────────────────────────────────────
    // When the regenerate flow emits a `creationProgress` message, the hook
    // forwards the live step into the modal so users see what's happening
    // ("Installing storefront dependencies" → "Writing skills" → "Finalizing")
    // instead of a single static "Reinstalling…" string for the whole minute.

    it('says the live step in the wait when progress is supplied', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            isBusy: true,
            progress: { currentOperation: 'Writing skills', message: '' },
        });
        expect(screen.getByText('Writing skills')).toBeInTheDocument();
    });

    it('says the live sub-message and how far, when progress carries them', () => {
        renderModal({
            skills: SKILLS,
            mcps: MCPS,
            isBusy: true,
            progress: {
                currentOperation: 'Installing storefront dependencies',
                message: 'This can take up to a minute',
                progress: 40,
            },
        });
        expect(screen.getByText('Installing storefront dependencies')).toBeInTheDocument();
        expect(screen.getByText('This can take up to a minute, 40%')).toBeInTheDocument();
    });

    // ─── Which body renders ──────────────────────────────────────────────────
    // Pairs are for the populated, healthy case. Whenever a half is missing or
    // errored the flat two-list body takes over, because it owns the "none wired"
    // and inspector-error copy — a section renders its MCP list only when it HAS
    // an MCP, so an empty or failed inspector produces no row to carry either
    // message. Every one of these was decided on a populated,
    // healthy fixture until now, so nothing said what the other cases do.

    describe('sections vs the flat body', () => {
        it('falls back to the flat body when the MCP inspector errored, however many servers it had listed', () => {
            renderModal({ skills: SKILLS, mcps: MCPS, hasMcpsError: true });

            expect(screen.queryByTestId('ai-integration-demo-builder')).not.toBeInTheDocument();
            expect(screen.getByTestId('ai-mcps-error')).toBeInTheDocument();
        });

        it('falls back to the flat body when the skill inspector errored', () => {
            renderModal({ skills: SKILLS, mcps: MCPS, hasSkillsError: true });

            expect(screen.queryByTestId('ai-integration-demo-builder')).not.toBeInTheDocument();
            expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
        });

        // The gated list is rendered once beneath everything, and ONLY under the
        // sectioned body: in the flat body the skills list already carries the
        // gated rows itself, so a second one would print the project's empty
        // state underneath a list that is not empty.
        it('renders the gated skills once, under the sections', () => {
            renderModal({
                skills: SKILLS,
                mcps: MCPS,
                gatedSkills: [
                    { file: 'eds-publish.md', toolId: 'publish_eds', reason: 'tool-missing' },
                ],
            });

            expect(screen.getAllByTestId('ai-skill-gated-row')).toHaveLength(1);
            expect(screen.getByTestId('ai-skills-group-gated')).toBeInTheDocument();
        });

        it('never says "No skills yet" under sections that are listing skills', () => {
            renderModal({ skills: SKILLS, mcps: MCPS, gatedSkills: [] });

            expect(screen.getByTestId('ai-integration-demo-builder')).toBeInTheDocument();
            expect(screen.queryByTestId('ai-skills-empty')).not.toBeInTheDocument();
        });

        it('adds no second skills list to the flat body', () => {
            // Skills are populated here, so nothing on screen may claim the
            // project has none.
            renderModal({ skills: SKILLS, mcps: [] });

            expect(screen.getByTestId('ai-mcps-empty')).toBeInTheDocument();
            expect(screen.queryAllByTestId('ai-skills-empty')).toHaveLength(0);
            expect(screen.getAllByTestId('ai-skills-list')).toHaveLength(1);
        });
    });
});

// ─── The pairing is recomputed when the inventory changes ────────────────────
// The sections are memoised on the two lists. A regenerate replaces both while
// the modal stays mounted — it is the same open dialog that triggered the write
// — so a memo that never re-ran would leave the user looking at the inventory
// from before the regenerate they had just watched finish.
describe('AiCapabilitiesModal — a refreshed inventory', () => {
    it('re-pairs when new skills and servers arrive in place', () => {
        const props = {
            onClose: jest.fn(),
            onRegenerate: jest.fn(),
        };
        const { rerender } = render(
            <Provider theme={defaultTheme}>
                <AiCapabilitiesModal skills={SKILLS} mcps={[MCPS[0]]} {...props} />
            </Provider>
        );

        expect(screen.queryByTestId('ai-integration-browser')).not.toBeInTheDocument();

        rerender(
            <Provider theme={defaultTheme}>
                <AiCapabilitiesModal skills={SKILLS} mcps={MCPS} {...props} />
            </Provider>
        );

        expect(screen.getByTestId('ai-integration-browser')).toBeInTheDocument();
    });
});

// ─── Closing while a regenerate is still running ─────────────────────────────
// Closing cancels nothing. A regenerate that is still running is handed to a
// progress notification so it does not finish unseen (PL-59 R8); an idle dialog
// has nothing to hand over.
describe('AiCapabilitiesModal — closing', () => {
    let postMessage: jest.SpyInstance;

    beforeEach(() => {
        postMessage = jest.spyOn(webviewClient, 'postMessage').mockImplementation(() => undefined);
    });

    afterEach(() => postMessage.mockRestore());

    it('hands a running regenerate to the background, by its operation id, then closes', () => {
        const { onClose } = renderModal({ skills: SKILLS, mcps: MCPS, isBusy: true });

        fireEvent.click(screen.getByRole('button', { name: 'Run in Background' }));

        expect(postMessage).toHaveBeenCalledTimes(1);
        expect(postMessage).toHaveBeenCalledWith('backgroundOperation', {
            id: 'ai-files',
            title: 'Regenerating AI Files',
        });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('just closes when nothing is running — no handover is sent', () => {
        const { onClose } = renderModal({ skills: SKILLS, mcps: MCPS });

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(postMessage).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
