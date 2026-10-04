/**
 * The one piece of the real-VS-Code UI tier that can run without VS Code: the
 * decision "is the text I just read from a webview frame the surface I named?".
 *
 * WHY THIS EXISTS (PL-66). On 2026-09-08 the sidebar UI test read the WIZARD's
 * 62 words while claiming to test the sidebar, and passed, because it only asked
 * for "some readable text". The frame selector picks by geometry, not by name, so
 * a test can be pointed at the wrong frame and nothing says so. These cases pin
 * the guard the UI tests now use: each surface has a word only it shows, and a
 * word ANOTHER surface shows is a hard failure, not something to wait out.
 *
 * The texts below are what the real surfaces render (sidebar: the 8 words the
 * first green run printed; wizard: the rail recorded on PL-46).
 */
import * as path from 'path';

type Verdict = { state: 'ready' | 'not-ready' | 'wrong-surface'; reason: string };
const { surfaceVerdict } = require(path.join(__dirname, '..', 'uiSurfaceText.js')) as {
    surfaceVerdict: (text: string, surface: string) => Verdict;
};

const SIDEBAR_TEXT = 'AI\nChat\nPrompts\nUtilities\nTools\nHelp\nSettings\nLogs';
const WIZARD_TEXT =
    'SETUP PROGRESS\nDemo Setup\nPrerequisites\nBuild Your Project\nFinal Review';

describe('surfaceVerdict — is this frame the surface the test names?', () => {
    it('accepts the sidebar reading its own content', () => {
        expect(surfaceVerdict(SIDEBAR_TEXT, 'sidebar').state).toBe('ready');
    });

    it('rejects the wizard read while claiming to be the sidebar (the 2026-09-08 failure)', () => {
        const verdict = surfaceVerdict(WIZARD_TEXT, 'sidebar');
        expect(verdict.state).toBe('wrong-surface');
        expect(verdict.reason).toMatch(/wizard/);
    });

    it('accepts the wizard, whose rail label is upper-cased by CSS', () => {
        expect(surfaceVerdict(WIZARD_TEXT, 'wizard').state).toBe('ready');
    });

    it('rejects the sidebar read while claiming to be the wizard', () => {
        expect(surfaceVerdict(SIDEBAR_TEXT, 'wizard').state).toBe('wrong-surface');
    });

    it('treats the wizard loading message as not ready, so a spinner never passes', () => {
        const verdict = surfaceVerdict('Loading Project Creation Wizard…', 'wizard');
        expect(verdict.state).toBe('not-ready');
    });

    it('treats an empty frame as not ready', () => {
        expect(surfaceVerdict('   \n ', 'sidebar').state).toBe('not-ready');
    });

    it('fails fast on a surface name it does not know', () => {
        expect(() => surfaceVerdict(SIDEBAR_TEXT, 'dashbord')).toThrow(/dashbord/);
    });
});
