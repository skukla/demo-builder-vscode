/**
 * Flow-aware step filtering.
 *
 * The content-SC flow hides the steps it doesn't need (prerequisites + the Adobe
 * auth/IO steps). The commerce flow (and legacy callers with no flow) are
 * unchanged. `flow` is a top-level step field composed with — not folded into —
 * the existing stack/condition checks, so a flow-only step is NOT hidden by the
 * no-stack branch (regression guard for a future Custom/no-stack commerce flow).
 */

import { filterStepsForStack, type WizardStepWithCondition } from '@/features/project-creation/ui/wizard/stepFiltering';
import type { Stack } from '@/types/stacks';

// Minimal EDS-like stack (DA.live content source).
const edsStack = { id: 'eds-paas', requiresDaLive: true, requiresGitHub: true } as unknown as Stack;

// A registry mirror covering the relevant cases.
const steps: WizardStepWithCondition[] = [
    { id: 'welcome', name: 'Welcome' },
    { id: 'prerequisites', name: 'Prerequisites', flow: 'commerce' },
    { id: 'adobe-auth', name: 'Adobe Auth', flow: 'commerce', condition: { requiresAdobeAuth: true } },
    { id: 'adobe-project', name: 'Adobe Project', flow: 'commerce', condition: { requiresAdobeIO: true } },
    { id: 'adobe-workspace', name: 'Adobe Workspace', flow: 'commerce', condition: { requiresAdobeIO: true } },
    { id: 'settings', name: 'Connect Commerce' },
    { id: 'eds-data-source', name: 'Content Configuration', condition: { stackRequires: 'requiresDaLive' } },
    { id: 'review', name: 'Review' },
];

const ids = (result: WizardStepWithCondition[]) => result.map(s => s.id);

describe('filterStepsForStack — flow awareness', () => {
    it('content flow hides prerequisites and all Adobe auth/IO steps', () => {
        const result = ids(filterStepsForStack(steps, edsStack, { flow: 'content', hasAdobeAuth: true, hasAdobeIO: true }));
        expect(result).not.toContain('prerequisites');
        expect(result).not.toContain('adobe-auth');
        expect(result).not.toContain('adobe-project');
        expect(result).not.toContain('adobe-workspace');
    });

    it('content flow keeps the shared steps (welcome, settings, content, review)', () => {
        const result = ids(filterStepsForStack(steps, edsStack, { flow: 'content', hasAdobeAuth: true, hasAdobeIO: true }));
        expect(result).toEqual(expect.arrayContaining(['welcome', 'settings', 'eds-data-source', 'review']));
    });

    it('commerce flow keeps prerequisites (unchanged)', () => {
        const result = ids(filterStepsForStack(steps, edsStack, { flow: 'commerce', hasAdobeAuth: true, hasAdobeIO: true }));
        expect(result).toContain('prerequisites');
    });

    it('absent flow behaves like commerce (prerequisites shown)', () => {
        const result = ids(filterStepsForStack(steps, edsStack, { hasAdobeAuth: true, hasAdobeIO: true }));
        expect(result).toContain('prerequisites');
    });

    it('composes flow with existing conditions: adobe-auth needs commerce AND hasAdobeAuth', () => {
        // commerce + auth needed → shown
        expect(ids(filterStepsForStack(steps, edsStack, { flow: 'commerce', hasAdobeAuth: true }))).toContain('adobe-auth');
        // commerce + no auth needed → hidden (existing behavior)
        expect(ids(filterStepsForStack(steps, edsStack, { flow: 'commerce', hasAdobeAuth: false }))).not.toContain('adobe-auth');
        // content → hidden regardless of hasAdobeAuth
        expect(ids(filterStepsForStack(steps, edsStack, { flow: 'content', hasAdobeAuth: true }))).not.toContain('adobe-auth');
    });

    it('regression guard: a flow-only commerce step is NOT hidden in no-stack mode', () => {
        const minimal: WizardStepWithCondition[] = [
            { id: 'welcome', name: 'Welcome' },
            { id: 'prerequisites', name: 'Prerequisites', flow: 'commerce' },
        ];
        const result = ids(filterStepsForStack(minimal, undefined, { flow: 'commerce' }));
        expect(result).toContain('prerequisites');
    });

    it('content flow in no-stack mode still drops its commerce-only steps', () => {
        const minimal: WizardStepWithCondition[] = [
            { id: 'welcome', name: 'Welcome' },
            { id: 'prerequisites', name: 'Prerequisites', flow: 'commerce' },
        ];
        const result = ids(filterStepsForStack(minimal, undefined, { flow: 'content' }));
        expect(result).not.toContain('prerequisites');
        expect(result).toContain('welcome');
    });
});
