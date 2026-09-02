/**
 * What the DA.live sign-in boxes reject WHILE THE USER TYPES.
 *
 * VS Code calls `validateInput` on every keystroke and shows what it returns under the
 * box, greying out the accept button. It is the only feedback between pasting the wrong
 * thing and being told, several steps later, that the token was invalid.
 *
 * Nothing tested it. Twenty-four mutants across the two boxes had NO coverage — not
 * survivors, unreached code — because every suite reads the options the box was OPENED
 * with and none of them ever calls the callback inside.
 *
 * These drive the real flow and then invoke the callback the flow installed, so they
 * break if the box stops carrying one at all.
 *
 * The scenario scripting for `vscode` is local rather than shared, for the reason the
 * family harness records: each suite in this family drives a different script, and a
 * shared union would be re-scripted per test anyway.
 */

let showInputBoxCalls: Array<{
    title?: string;
    password?: boolean;
    validateInput?: (value: string) => string | null | undefined;
}> = [];
let showInputBoxResponses: Array<string | undefined> = [];
let showInputBoxIndex = 0;

jest.mock('vscode', () => ({
    window: {
        showInputBox: jest.fn().mockImplementation((options) => {
            showInputBoxCalls.push(options);
            const response = showInputBoxResponses[showInputBoxIndex];
            showInputBoxIndex++;
            return Promise.resolve(response);
        }),
        showInformationMessage: jest.fn().mockResolvedValue('I have my token'),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
        withProgress: jest.fn().mockImplementation((_o, cb) => cb()),
    },
    env: { openExternal: jest.fn(), clipboard: { readText: jest.fn().mockResolvedValue('') } },
    Uri: { parse: jest.fn((url: string) => ({ url })) },
    ProgressLocation: { Notification: 15 },
    // The real auth service constructs one at import time. Keeping the REAL service and
    // supplying this is a smaller lie than mocking the service away.
    EventEmitter: class {
        private handlers: Array<(v: unknown) => void> = [];
        event = (h: (v: unknown) => void) => {
            this.handlers.push(h);
            return { dispose: () => undefined };
        };
        fire = (v: unknown) => this.handlers.forEach((h) => h(v));
        dispose = () => undefined;
    },
}));

import { showDaLiveAuthQuickPick, createAuthPromptContext } from './daLiveAuthPrompt.testUtils';

/** Run the flow far enough to open both boxes, cancelling at the token step. */
async function openBothBoxes() {
    showInputBoxCalls = [];
    showInputBoxIndex = 0;
    // org typed, then the token step cancelled — the boxes are what matter here.
    showInputBoxResponses = ['my-org', undefined];
    await showDaLiveAuthQuickPick(createAuthPromptContext());
}

/** The live-validation callback the named box was opened with. */
function validatorFor(titleFragment: string): (value: string) => string | null | undefined {
    const call = showInputBoxCalls.find((c) => (c.title ?? '').includes(titleFragment));
    if (!call?.validateInput) {
        throw new Error(
            `No box titled like "${titleFragment}" carried a validateInput. Opened: ` +
                showInputBoxCalls.map((c) => c.title).join(', ')
        );
    }
    return call.validateInput;
}

beforeEach(async () => {
    jest.clearAllMocks();
    await openBothBoxes();
});

describe('the namespace box', () => {
    it('will not accept an empty namespace', () => {
        expect(validatorFor('namespace')('')).toMatch(/required/i);
    });

    it('will not accept a namespace that is only spaces', () => {
        // Untrimmed, this passes the box and then fails much later as a bad org.
        expect(validatorFor('namespace')('   ')).toMatch(/required/i);
    });

    it('accepts a real namespace', () => {
        expect(validatorFor('namespace')('demo-system-stores')).toBeNull();
    });
});

describe('the token box', () => {
    it('will not accept an empty token', () => {
        expect(validatorFor('token')('')).toMatch(/required/i);
    });

    it('will not accept a token that is only spaces', () => {
        expect(validatorFor('token')('   ')).toMatch(/required/i);
    });

    it('rejects something that is not a token at all, naming what one looks like', () => {
        // The common mistake is pasting the page URL or a different credential. Saying
        // what a token starts with is the difference between a fixable message and a
        // dead end.
        const message = validatorFor('token')('https://da.live/#/my-org');

        expect(message).toMatch(/eyJ/);
    });

    it('accepts a token once it starts the way a JWT does, whitespace and all', () => {
        // The bookmarklet copy often carries a trailing newline; the box must not
        // reject that, because the flow trims it moments later.
        expect(validatorFor('token')('  eyJhbGciOiJIUzI1NiJ9.payload.signature  ')).toBeNull();
    });

    it('is password-masked, so a shoulder-surfer does not read the credential', () => {
        const call = showInputBoxCalls.find((c) => (c.title ?? '').includes('token'));
        expect(call?.password).toBe(true);
    });
});
