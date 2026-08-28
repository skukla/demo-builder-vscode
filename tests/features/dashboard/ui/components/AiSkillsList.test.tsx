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
});
