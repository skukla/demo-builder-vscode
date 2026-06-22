/**
 * Group-Paced Step Registration Test (R1 — Step 2 of 7)
 *
 * Locks the new group-paced wizard ordering in wizard-steps.json. The wizard is
 * reorganized around component GROUPS as steps (commerce / integrations /
 * storefront), replacing the per-concern steps (settings, eds-connect-services,
 * eds-repository-config, component-selection) and the superseded Slice-2 hub
 * (project-builder).
 *
 * Target order (array order = wizard order):
 *   welcome → prerequisites → adobe-auth → adobe-project → adobe-workspace →
 *   commerce → integrations → storefront → review → storefront-setup → create-project
 */

import wizardStepsConfig from '@/features/project-creation/config/wizard-steps.json';

interface ConfigStep {
    id: string;
    name: string;
    description?: string;
    enabled?: boolean;
    condition?: Record<string, unknown>;
}

const steps = (wizardStepsConfig as { steps: ConfigStep[] }).steps;
const stepIds = steps.map(s => s.id);
const idx = (id: string) => stepIds.indexOf(id);

describe('wizard-steps.json — group-paced step registration', () => {
    describe('new group steps present', () => {
        it.each(['commerce', 'integrations', 'storefront'])(
            'includes the %s group step',
            (id) => {
                expect(stepIds).toContain(id);
            },
        );
    });

    describe('retired steps removed', () => {
        it.each([
            'project-builder',
            'component-selection',
            'settings',
            'eds-connect-services',
            'eds-repository-config',
        ])('does NOT include the retired %s step', (id) => {
            expect(stepIds).not.toContain(id);
        });
    });

    describe('group-paced order', () => {
        it('orders welcome → prerequisites → adobe-* → commerce → integrations → storefront → review → storefront-setup → create-project', () => {
            expect(idx('welcome')).toBeGreaterThanOrEqual(0);
            expect(idx('welcome')).toBeLessThan(idx('prerequisites'));
            expect(idx('prerequisites')).toBeLessThan(idx('adobe-auth'));
            expect(idx('adobe-auth')).toBeLessThan(idx('adobe-project'));
            expect(idx('adobe-project')).toBeLessThan(idx('adobe-workspace'));
            expect(idx('adobe-workspace')).toBeLessThan(idx('commerce'));
            expect(idx('commerce')).toBeLessThan(idx('integrations'));
            expect(idx('integrations')).toBeLessThan(idx('storefront'));
            expect(idx('storefront')).toBeLessThan(idx('review'));
            expect(idx('review')).toBeLessThan(idx('storefront-setup'));
            expect(idx('storefront-setup')).toBeLessThan(idx('create-project'));
        });
    });

    describe('group step conditions', () => {
        it('gates integrations on requiresAdobeAuth', () => {
            const step = steps.find(s => s.id === 'integrations');
            expect(step?.condition?.requiresAdobeAuth).toBe(true);
        });

        it('gates storefront on stackRequiresAny including requiresGitHub and requiresDaLive', () => {
            const step = steps.find(s => s.id === 'storefront');
            const stackRequiresAny = step?.condition?.stackRequiresAny as string[] | undefined;
            expect(stackRequiresAny).toEqual(
                expect.arrayContaining(['requiresGitHub', 'requiresDaLive']),
            );
        });

        it('registers commerce unconditionally and enabled', () => {
            const step = steps.find(s => s.id === 'commerce');
            expect(step?.enabled).toBe(true);
            expect(step?.condition).toBeUndefined();
        });
    });
});
