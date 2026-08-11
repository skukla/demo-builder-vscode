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

function makeSkill(name: string, source: SkillInventoryEntry['source']): SkillInventoryEntry {
    return { name, description: null, path: `/p/.claude/skills/${name}.md`, source };
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
        it('shows a "Skills · N installed" summary line with the total count', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            const summary = screen.getByTestId('ai-skills-summary');
            expect(summary).toHaveTextContent(/Skills/);
            expect(summary).toHaveTextContent(/3 installed/);
        });

        it('renders group rows with their counts by default (no outer toggle)', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            const dbRow = screen.getByTestId('ai-skills-group-demo-builder');
            expect(dbRow).toHaveTextContent(/Demo Builder/);
            expect(dbRow).toHaveTextContent(/2/);

            const adobeRow = screen.getByTestId('ai-skills-group-adobe');
            expect(adobeRow).toHaveTextContent(/Adobe AEM/);
            expect(adobeRow).toHaveTextContent(/1/);
        });

        it('renders groups in canonical order: Demo Builder → Adobe AEM → Custom', () => {
            renderList({
                skills: [
                    makeSkill('zeta', 'unknown'),
                    makeSkill('beta', 'adobe'),
                    makeSkill('alpha', 'demo-builder'),
                ],
            });

            const rows = screen.getAllByTestId(/^ai-skills-group-/);
            const ids = rows.map((r) => r.getAttribute('data-testid'));
            expect(ids).toEqual([
                'ai-skills-group-demo-builder',
                'ai-skills-group-adobe',
                'ai-skills-group-unknown',
            ]);
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
                    makeSkill('aem-tester', 'adobe'),
                ],
            });
            expect(screen.getByText('add-component')).toBeInTheDocument();
            expect(screen.getByText('aem-tester')).toBeInTheDocument();
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
            expect(rows).toEqual(['alpha', 'beta', 'zeta']);
        });

        it('renders each group header with its label and count', () => {
            renderList({
                skills: [
                    makeSkill('add-component', 'demo-builder'),
                    makeSkill('sync-changes', 'demo-builder'),
                    makeSkill('aem-tester', 'adobe'),
                ],
            });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toHaveTextContent(
                'Demo Builder · 2'
            );
            expect(screen.getByTestId('ai-skills-group-adobe')).toHaveTextContent('Adobe AEM · 1');
        });

        it('marks headers with the sticky readable-header class', () => {
            renderList({ skills: [makeSkill('add-component', 'demo-builder')] });

            expect(screen.getByTestId('ai-skills-group-demo-builder')).toHaveClass(
                'ai-skills-group-header'
            );
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
