/**
 * AiSkillsList Tests
 *
 * The skills section always shows the summary line and the group rows.
 * Each group row is itself a disclosure — clicking it reveals the group's
 * alphabetized skill names; clicking again hides them. Groups expand
 * independently. There is no outer toggle.
 */

import { render, screen } from '@testing-library/react';
import { Provider, defaultTheme } from '@adobe/react-spectrum';
import React from 'react';
import { AiSkillsList } from '@/features/dashboard/ui/components/AiSkillsList';
import type { SkillInventoryEntry } from '@/types/ai';
import '@testing-library/jest-dom';

function makeSkill(
    name: string,
    source: SkillInventoryEntry['source'],
    bundle?: string
): SkillInventoryEntry {
    return { name, description: null, path: `/p/.claude/skills/${name}.md`, source, bundle };
}

function renderList(props: Partial<React.ComponentProps<typeof AiSkillsList>> = {}) {
    return render(
        <Provider theme={defaultTheme}>
            <AiSkillsList {...props} skills={props.skills ?? []} />
        </Provider>
    );
}

describe('AiSkillsList', () => {
    describe('Default state — groups visible, individually collapsed', () => {
        it('shows a "Skills · N" summary line counted like the MCP section', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe', 'aem'),
                ],
            });

            const summary = screen.getByTestId('ai-skills-summary');
            expect(summary).toHaveTextContent('Skills · 3');
        });

        it('renders group rows with their counts by default (no outer toggle)', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe', 'aem'),
                ],
            });

            const dbRow = screen.getByTestId('ai-skills-group-demo-builder');
            expect(dbRow).toHaveTextContent(/Demo Builder/);
            expect(dbRow).toHaveTextContent(/2/);

            const adobeRow = screen.getByTestId('ai-skills-group-adobe-aem');
            expect(adobeRow).toHaveTextContent(/Adobe Commerce Storefront skills/);
            expect(adobeRow).toHaveTextContent(/1/);
        });

        it('renders groups in canonical order: Demo Builder → Adobe bundles → Custom', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'unknown'),
                    makeSkill('beta', 'adobe', 'aem'),
                    makeSkill('alpha', 'demo-builder'),
                ],
            });

            const rows = screen.getAllByTestId(/^ai-skills-group-/);
            const ids = rows.map((r) => r.getAttribute('data-testid'));
            expect(ids).toEqual([
                'ai-skills-group-demo-builder',
                'ai-skills-group-adobe-aem',
                'ai-skills-group-unknown',
            ]);
        });

        it('labels an App Builder bundle as App Builder, not AEM', () => {
            // The whole reported defect: every nested bundle was labelled "Adobe
            // AEM" because the group was keyed on "lives in a subdirectory".
            renderList({
                skills: [
                    makeSkill('appbuilder-architect', 'adobe', 'appbuilder'),
                    makeSkill('appbuilder-tester', 'adobe', 'appbuilder'),
                ],
            });

            const row = screen.getByTestId('ai-skills-group-adobe-appbuilder');
            expect(row).toHaveTextContent('Adobe Commerce Integration Starter Kit skills · 2');
            expect(screen.queryByText(/Adobe Commerce Storefront skills/)).not.toBeInTheDocument();
        });

        it('separates two Adobe bundles into their own groups', () => {
            renderList({
                skills: [
                    makeSkill('appbuilder-architect', 'adobe', 'appbuilder'),
                    makeSkill('aem-block-builder', 'adobe', 'aem'),
                ],
            });

            expect(screen.getByTestId('ai-skills-group-adobe-aem')).toHaveTextContent(
                'Adobe Commerce Storefront skills · 1'
            );
            expect(screen.getByTestId('ai-skills-group-adobe-appbuilder')).toHaveTextContent(
                'Adobe Commerce Integration Starter Kit skills · 1'
            );
        });

        it('falls back to a plain Adobe label for an unrecognised bundle', () => {
            // A future bundle must not silently inherit another bundle's name.
            renderList({ skills: [makeSkill('x', 'adobe', 'sometool')] });

            const row = screen.getByTestId('ai-skills-group-adobe-sometool');
            expect(row).toHaveTextContent('Adobe skills · 1');
        });

        it('omits groups with no skills', () => {
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toBeInTheDocument();
            expect(screen.queryByTestId('ai-skills-group-adobe')).not.toBeInTheDocument();
            expect(screen.queryByTestId('ai-skills-group-unknown')).not.toBeInTheDocument();
        });

        it('renders ALL skill names at rest (flat list — no expansion, no modal jump)', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe', 'aem'),
                ],
            });
            const rows = screen.getAllByTestId('ai-skill-row').map((r) => r.textContent);
            expect(rows).toEqual(['Add component · add-component', 'Tester · aem-tester']);
        });

        // The titles a user can match against Adobe's docs. The on-disk names
        // are prefixed (`aem-`/`appbuilder-`) so two bundles that both ship a
        // `tester` stay distinct on disk; that prefix appears nowhere in the
        // documentation, so it must not be the thing a person reads first.
        it('titles Adobe skills as the docs title them, keeping the literal name beside it', () => {
            renderList({
                skills: [
                    makeSkill('aem-block-developer', 'adobe', 'aem'),
                    makeSkill('aem-dropin-developer', 'adobe', 'aem'),
                    makeSkill('appbuilder-devops-engineer', 'adobe', 'appbuilder'),
                ],
            });

            const rows = screen.getAllByTestId('ai-skill-row').map((r) => r.textContent);
            // Groups sort by label: "Adobe Commerce Integration Starter Kit
            // skills" precedes "Adobe Commerce Storefront skills".
            expect(rows).toEqual([
                'DevOps engineer · appbuilder-devops-engineer',
                'Block developer · aem-block-developer',
                'Drop-in developer · aem-dropin-developer',
            ]);
        });
    });

    describe('Flat grouped list', () => {
        it('sorts skills alphabetically within a group', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'demo-builder'),
                    makeSkill('alpha', 'demo-builder'),
                    makeSkill('beta', 'demo-builder'),
                ],
            });

            const rows = screen.getAllByTestId('ai-skill-row').map((r) => r.textContent);
            expect(rows).toEqual(['Alpha · alpha', 'Beta · beta', 'Zeta · zeta']);
        });

        it('renders each group header with its label and count', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe', 'aem'),
                ],
            });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toHaveTextContent(
                'Demo Builder skills · 2'
            );
            expect(screen.getByTestId('ai-skills-group-adobe-aem')).toHaveTextContent(
                'Adobe Commerce Storefront skills · 1'
            );
        });

        it('leaves skill names at the app default size, not the 12px .text-sm', () => {
            // Every other modal uses bare Spectrum <Text>; this list forced 12px
            // in nine places, which is why it read denser than the rest of the app.
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            expect(screen.getByTestId('ai-skill-row')).not.toHaveClass('text-sm');
        });

        it('marks headers with the sticky readable-header class', () => {
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toHaveClass(
                'ai-skills-group-header'
            );
        });
    });

    // ADR-013: files the user edited are kept (not overwritten) on regenerate;
    // the list flags them so "my customization survived" is visible, not silent.
    describe('edited flags — "kept your version" (ADR-013)', () => {
        it('flags a skill whose bundle file appears in editedFiles', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                ],
                editedFiles: ['.claude/skills/add-component.md'],
            });

            const flags = screen.getAllByTestId('ai-skill-edited-flag');
            expect(flags).toHaveLength(1);
            const rows = screen.getAllByTestId('ai-skill-row');
            const flagged = rows.find((r) => r.textContent?.includes('add-component'));
            expect(flagged?.textContent).toMatch(/edited/i);
        });

        it('renders no flags when editedFiles is absent (pre-ADR project)', () => {
            renderList({
                skills: [makeSkill('add-component', 'demo-builder')],
            });

            expect(screen.queryByTestId('ai-skill-edited-flag')).not.toBeInTheDocument();
        });

        it("ignores edited entries that match no skill (non-skill files are the modal note's job)", () => {
            renderList({
                skills: [makeSkill('add-component', 'demo-builder')],
                editedFiles: ['AGENTS.md'],
            });

            expect(screen.queryByTestId('ai-skill-edited-flag')).not.toBeInTheDocument();
        });
    });

    describe('Empty / error states', () => {
        it('shows a plain-language empty state when there are no skills', () => {
            renderList({ skills: [] });
            expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
        });

        it('shows an error row when the inspector errored', () => {
            renderList({ skills: [], hasError: true });
            expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
        });
    });
});

/**
 * Reported 2026-08-06 alongside the "Verifying" hang: this list read
 * "No skills yet. Regenerate AI files to set them up." for a project whose files were
 * fine — it simply had not loaded. `verifyResult?.inventory` was undefined, collapsed
 * to an empty array on the way in, and the list could not tell "none exist" from
 * "not asked yet".
 *
 * Telling someone to regenerate healthy files is worse than saying nothing: it is a
 * confident wrong instruction pointing at the one remedy they should not reach for.
 */
describe('loading vs empty (2026-08-06)', () => {
    it('says it is still checking rather than claiming there are none', () => {
        renderList({ skills: [], isLoading: true });

        expect(screen.getByTestId('ai-skills-loading')).toBeInTheDocument();
        expect(screen.queryByTestId('ai-skills-empty')).not.toBeInTheDocument();
    });

    it('never tells you to regenerate files it has not looked at', () => {
        renderList({ skills: [], isLoading: true });

        expect(screen.queryByText(/Regenerate AI files/i)).not.toBeInTheDocument();
    });

    it('still reports genuine emptiness once loaded', () => {
        renderList({ skills: [], isLoading: false });

        expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
    });

    it('prefers the error row over the loading row', () => {
        // An inspector error is a settled answer; "checking" would be a lie.
        renderList({ skills: [], isLoading: true, hasError: true });

        expect(screen.getByTestId('ai-skills-error')).toBeInTheDocument();
        expect(screen.queryByTestId('ai-skills-loading')).not.toBeInTheDocument();
    });

    describe('Gated skills are not "no skills"', () => {
        // REGRESSION 2026-09-02. The capabilities modal mounts one of these purely
        // to carry the gated list, with `skills` hard-wired empty. The empty state
        // tested only `skills`, so it fired every time: "No skills yet" printed
        // under sections that were listing the project's skills and MCP servers,
        // and the gated list it was mounted for could never render at all.
        const GATED = [
            { file: 'querying-commerce.md', toolId: 'commerce', reason: 'tool-missing' as const },
        ];

        it('does NOT claim "no skills yet" when it is carrying gated skills', () => {
            renderList({ skills: [], gatedSkills: GATED, flat: true });

            expect(screen.queryByTestId('ai-skills-empty')).not.toBeInTheDocument();
        });

        it('renders the gated group even with no installed skills of its own', () => {
            renderList({ skills: [], gatedSkills: GATED, flat: true });

            expect(screen.getByTestId('ai-skills-group-gated')).toHaveTextContent(
                'Not available · 1'
            );
            expect(screen.getByTestId('ai-skill-gated-row')).toHaveTextContent(
                'querying-commerce.md'
            );
        });

        it('still claims "no skills yet" when there is genuinely nothing (control)', () => {
            renderList({ skills: [], gatedSkills: [] });

            expect(screen.getByTestId('ai-skills-empty')).toBeInTheDocument();
        });

        it('renders no "Not available" group for an EMPTY gated list', () => {
            // An empty array is not an absence to report. With a skill present the
            // early empty return does not fire, so the group guard is the only
            // thing standing between the reader and a heading over nothing.
            renderList({ skills: [makeSkill('add-component', 'demo-builder')], gatedSkills: [] });

            expect(screen.queryByTestId('ai-skills-group-gated')).not.toBeInTheDocument();
        });

        // The two reasons need different remedies, so the row has to say WHICH.
        // Both once read the same line, which told half of them the wrong fix.
        it('says the setting is off for a setting-disabled skill', () => {
            renderList({
                skills: [],
                gatedSkills: [
                    { file: 'playwright.md', toolId: 'playwright', reason: 'setting-disabled' },
                ],
                flat: true,
            });

            const row = screen.getByTestId('ai-skill-gated-row');
            expect(row).toHaveTextContent('third-party tooling setting');
            expect(row).not.toHaveTextContent('Regenerate AI Files installs it');
        });

        it('says the tool is missing, and what installs it, for a tool-missing skill', () => {
            renderList({
                skills: [],
                gatedSkills: [
                    { file: 'playwright.md', toolId: 'playwright', reason: 'tool-missing' },
                ],
                flat: true,
            });

            const row = screen.getByTestId('ai-skill-gated-row');
            expect(row).toHaveTextContent('Regenerate AI Files installs it');
            expect(row).not.toHaveTextContent('third-party tooling setting');
        });
    });
});

describe('grouping keys off the SOURCE, and only Adobe splits per bundle', () => {
    // The bundle split exists so two Adobe bundles never share a heading. It must
    // not leak: a stray bundle on a non-Adobe skill would invent a group nothing
    // has a label for, and an Adobe skill with no bundle must stay under "Adobe".

    it('keeps a non-Adobe skill under its source even when it carries a bundle', () => {
        renderList({ skills: [makeSkill('local-helper', 'unknown', 'sometool')] });

        expect(screen.getByTestId('ai-skills-group-unknown')).toHaveTextContent(
            'Custom skills · 1'
        );
        expect(screen.queryByTestId('ai-skills-group-unknown-sometool')).not.toBeInTheDocument();
    });

    it('keeps an Adobe skill with no bundle under a plain Adobe group', () => {
        renderList({ skills: [makeSkill('loose-skill', 'adobe')] });

        expect(screen.getByTestId('ai-skills-group-adobe')).toHaveTextContent('Adobe skills · 1');
    });
});

describe('titles strip the bundle prefix only when the name actually carries it', () => {
    it('leaves a bundled skill whose name is not prefixed intact', () => {
        // Slicing `bundle.length + 1` unconditionally would eat four characters
        // off the front of the title and leave the row reading nonsense.
        renderList({ skills: [makeSkill('standalone-thing', 'adobe', 'aem')] });

        expect(screen.getByTestId('ai-skill-row')).toHaveTextContent(
            'Standalone thing · standalone-thing'
        );
    });
});

describe('it re-groups when the skills change', () => {
    it('renders the new list, not the one it first grouped', () => {
        const { rerender } = render(
            <Provider theme={defaultTheme}>
                <AiSkillsList skills={[makeSkill('alpha', 'demo-builder')]} />
            </Provider>
        );
        expect(screen.getByTestId('ai-skill-row')).toHaveTextContent('Alpha · alpha');

        rerender(
            <Provider theme={defaultTheme}>
                <AiSkillsList skills={[makeSkill('aem-tester', 'adobe', 'aem')]} />
            </Provider>
        );

        const rows = screen.getAllByTestId('ai-skill-row').map((r) => r.textContent);
        expect(rows).toEqual(['Tester · aem-tester']);
    });
});
