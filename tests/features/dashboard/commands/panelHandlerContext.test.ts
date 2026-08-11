/**
 * Panel handler contexts must have NO holes.
 *
 * Every panel command used to hand-roll its context and fill the managers it did not
 * personally need with `undefined as unknown as ...` — four of the five did. That is
 * survivable only while a panel owns its handlers. The integrations panel reuses the
 * wizard's, and an absent dependency became a confident, wrong, user-facing
 * diagnosis: the destination picker reported "this organization is not available on
 * your current Adobe account" for a perfectly reachable org, because
 * `context.authManager?.getOrganizations() ?? []` returned an empty list while the
 * project dashboard's own IMS-org badge was green (2026-07-31).
 *
 * Panels build their context through `createPanelHandlerContext` now. This asserts
 * nobody reintroduces a hole — the cast is the tell, because it is the only way to
 * put `undefined` where a manager belongs without tsc objecting.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '../../../../src');

/** Command files that own a webview panel. */
const PANEL_COMMANDS = [
    'features/dashboard/commands/showIntegrations.ts',
    'features/dashboard/commands/showDashboard.ts',
    'features/dashboard/commands/configure.ts',
    'features/dashboard/commands/openAi.ts',
    'features/projects-dashboard/commands/showProjectsList.ts',
    'features/project-creation/commands/createProject.ts',
];

describe('panel handler contexts', () => {
    it.each(PANEL_COMMANDS)('%s declares no undefined manager', (rel) => {
        const source = fs.readFileSync(path.join(SRC, rel), 'utf8');

        expect(source).not.toMatch(/undefined as unknown as HandlerContext/);
    });

    it('the shared factory supplies every manager a handler can reach', () => {
        // Strip comments: the factory's own docstring NAMES the pattern it exists to
        // prevent, and matching that would fail on the documentation.
        const source = fs
            .readFileSync(path.join(SRC, 'commands/handlerContextFactory.ts'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        for (const key of [
            'prereqManager',
            'authManager',
            'errorLogger',
            'progressUnifier',
            'stepLogger',
        ]) {
            expect(source).toMatch(new RegExp(`${key}:`));
        }
        expect(source).not.toMatch(/undefined as unknown/);
    });
});
