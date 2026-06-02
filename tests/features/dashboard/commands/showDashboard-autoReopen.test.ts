/**
 * Tests for the "auto-reopen projects list on dashboard close" safety net.
 *
 * When the user closes the project dashboard webview inside a workspace that
 * is anchored to a Demo Builder project, we re-surface the projects list so
 * the user never ends up in a bare workspace with no Demo Builder navigation.
 */

import * as os from 'os';
import * as path from 'path';
import { shouldAutoReopenProjectsList } from '@/features/dashboard/commands/showDashboard';

const PROJECTS_BASE = path.join(os.homedir(), '.demo-builder', 'projects');

describe('shouldAutoReopenProjectsList', () => {
    it('returns false when there is no workspace folder open', () => {
        expect(shouldAutoReopenProjectsList(undefined)).toBe(false);
    });

    it('returns false when workspace folder is an arbitrary directory outside Demo Builder', () => {
        expect(shouldAutoReopenProjectsList('/Users/test/some-other-repo')).toBe(false);
    });

    it('returns true when workspace folder IS the Demo Builder projects root (always-root home)', () => {
        // In the always-root model the window is homed at the projects root, so
        // closing an in-place dashboard there must reopen the projects list
        // rather than strand the user on a bare root workspace.
        expect(shouldAutoReopenProjectsList(PROJECTS_BASE)).toBe(true);
    });

    it('returns true when workspace folder is inside the Demo Builder projects directory', () => {
        const projectPath = path.join(PROJECTS_BASE, 'my-demo');
        expect(shouldAutoReopenProjectsList(projectPath)).toBe(true);
    });

    it('returns true for nested paths inside a Demo Builder project folder', () => {
        const nestedPath = path.join(PROJECTS_BASE, 'my-demo', 'subfolder');
        expect(shouldAutoReopenProjectsList(nestedPath)).toBe(true);
    });

    it('rejects path-traversal attempts that escape the projects base', () => {
        // e.g. `~/.demo-builder/projects/../../etc/passwd` resolves outside the base
        const traversal = path.join(PROJECTS_BASE, '..', '..', 'etc', 'passwd');
        expect(shouldAutoReopenProjectsList(traversal)).toBe(false);
    });

    it('returns false for the empty string', () => {
        expect(shouldAutoReopenProjectsList('')).toBe(false);
    });

    it('returns false when a webview transition is in progress (caller is mid-navigation)', () => {
        // When the user explicitly navigates somewhere (e.g. tile-clicks another
        // project, triggering a workspace switch), the dashboard's dispose fires
        // during teardown. Auto-reopening the projects list at that moment would
        // briefly flash before the reload completes. The transition flag tells us
        // to stay out of the way.
        const projectPath = path.join(PROJECTS_BASE, 'my-demo');
        expect(shouldAutoReopenProjectsList(projectPath, true)).toBe(false);
    });

    it('returns true when path is a Demo Builder project AND no transition is in progress', () => {
        const projectPath = path.join(PROJECTS_BASE, 'my-demo');
        expect(shouldAutoReopenProjectsList(projectPath, false)).toBe(true);
    });
});
