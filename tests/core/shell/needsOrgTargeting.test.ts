/**
 * needsOrgTargeting — the detector behind the "ran without an org target" warning.
 *
 * It changes no behaviour: env injection happens whenever a context is active,
 * independent of this predicate. Its whole job is to notice an `aio` command
 * whose ANSWER depends on the selected workspace running outside a
 * withOrgContext scope, and say so with the command named.
 *
 * That makes a false NEGATIVE the expensive direction, and it had one: the
 * api-mesh pattern required the colon spelling, so `aio api-mesh delete
 * --autoConfirmAction` — untargeted, destructive, and running with no confirm
 * prompt — was invisible to it. The command strings below are taken from real
 * call sites in src/, not invented, so the detector is pinned against what this
 * codebase actually runs.
 */

import { needsOrgTargeting } from '@/core/shell/orgContextEnv';

describe('needsOrgTargeting', () => {
    // Both spellings are live in src/. The colon form was the only one matched
    // until 2026-08-16.
    describe.each([
        ['colon', 'aio api-mesh:get --active --json'],
        ['colon', 'aio api-mesh:describe'],
        ['colon', 'aio api-mesh:create'],
        ['colon', 'aio api-mesh:update'],
        ['colon', 'aio api-mesh:delete --autoConfirmAction'],
        ['space', 'aio api-mesh get'],
        ['space', 'aio api-mesh get --active'],
        ['space', 'aio api-mesh delete --autoConfirmAction'],
    ])('%s form', (_form, command) => {
        it(`flags "${command}"`, () => {
            expect(needsOrgTargeting(command)).toBe(true);
        });
    });

    it.each(['aio app deploy', 'aio app undeploy', 'aio app get-url --json'])(
        'flags workspace-dependent app command "%s"',
        (command) => {
            expect(needsOrgTargeting(command)).toBe(true);
        }
    );

    it('tolerates leading and trailing whitespace', () => {
        expect(needsOrgTargeting('  aio api-mesh get  ')).toBe(true);
    });

    describe('deliberate exclusions', () => {
        // Probes whether the plugin is installed at all. No workspace to be
        // wrong about, and warning on it would be noise on a startup check.
        it('does not flag the api-mesh plugin probe', () => {
            expect(needsOrgTargeting('aio api-mesh --help')).toBe(false);
        });

        // Choosing an org is HOW a target gets obtained — these must be able to
        // run untargeted or there is no way to bootstrap one.
        it.each([
            'aio console org list --json',
            'aio console where --json',
            'aio console workspace download "/tmp/x.json" --workspaceId abc',
            'aio auth login -f',
            'aio config get ims.contexts.cli',
        ])('does not flag "%s"', (command) => {
            expect(needsOrgTargeting(command)).toBe(false);
        });

        it('does not flag non-aio commands that merely mention api-mesh', () => {
            expect(needsOrgTargeting('echo aio api-mesh get')).toBe(false);
            expect(needsOrgTargeting('npm run aio api-mesh get')).toBe(false);
        });

        // `aio app list` reads against the selected workspace, so it looks like a
        // candidate. It is deliberately absent until its call sites are traced —
        // this pins the current answer so adding it is a conscious change rather
        // than an accident.
        it('does not currently flag `aio app list` (untraced, see comment)', () => {
            expect(needsOrgTargeting('aio app list --json')).toBe(false);
        });
    });
});
