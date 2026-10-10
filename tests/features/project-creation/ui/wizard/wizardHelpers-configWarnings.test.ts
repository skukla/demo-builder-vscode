/**
 * buildProjectConfig — the two configuration warnings, and where they go.
 *
 * A saved project file can name a stack with no demo package, or a stack this
 * build does not ship. Neither stops the build of the config; each is reported
 * once through the sink the caller hands in (the wizard hands the Debug Logs
 * channel), and through the console only when no sink was handed in.
 *
 * The assertions are on WHETHER a warning is sent, how many, to which sink, and
 * which ids it names — the data an SC needs to find the project file's bad line —
 * never on the sentence around them.
 */

import {
    buildProjectConfig,
    type ProjectConfigSource,
} from '@/features/project-creation/ui/wizard/wizardHelpers';

const BASE: ProjectConfigSource = { projectName: 'test-project' };

/** A stack and a package this build ships (stacks.json, demo-packages.json). */
const SHIPPED_STACK = 'eds-accs';
const SHIPPED_PACKAGE = 'citisignal';
const UNKNOWN_STACK = 'a-stack-this-build-lacks';

describe('buildProjectConfig — configuration warnings', () => {
    let warn: jest.Mock<void, [string]>;
    let consoleWarn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.fn();
        consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleWarn.mockRestore();
    });

    it('stays silent when the stack and the package both resolve', () => {
        const config = buildProjectConfig(
            { ...BASE, selectedStack: SHIPPED_STACK, selectedPackage: SHIPPED_PACKAGE },
            null,
            undefined,
            warn
        );

        expect(warn).not.toHaveBeenCalled();
        expect(config.components?.frontend).toBeDefined();
    });

    it('stays silent when neither a stack nor a package was chosen', () => {
        buildProjectConfig(BASE, null, undefined, warn);

        expect(warn).not.toHaveBeenCalled();
    });

    it('stays silent for a package with no stack yet', () => {
        buildProjectConfig({ ...BASE, selectedPackage: SHIPPED_PACKAGE }, null, undefined, warn);

        expect(warn).not.toHaveBeenCalled();
    });

    it('warns once, naming the stack, when a shipped stack arrives with no package', () => {
        const config = buildProjectConfig(
            { ...BASE, selectedStack: SHIPPED_STACK },
            null,
            undefined,
            warn
        );

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(`'${SHIPPED_STACK}'`);
        expect(consoleWarn).not.toHaveBeenCalled();
        // The stack itself resolves, so its components are still built.
        expect(config.components?.frontend).toBeDefined();
    });

    it('warns once, naming the stack and its package, for a stack this build does not ship', () => {
        const config = buildProjectConfig(
            { ...BASE, selectedStack: UNKNOWN_STACK, selectedPackage: SHIPPED_PACKAGE },
            null,
            undefined,
            warn
        );

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain(`'${UNKNOWN_STACK}'`);
        expect(warn.mock.calls[0][0]).toContain(`'${SHIPPED_PACKAGE}'`);
        expect(consoleWarn).not.toHaveBeenCalled();
        expect(config.components).toBeUndefined();
    });

    it('sends both warnings for an unshipped stack with no package', () => {
        buildProjectConfig({ ...BASE, selectedStack: UNKNOWN_STACK }, null, undefined, warn);

        expect(warn).toHaveBeenCalledTimes(2);
        for (const [message] of warn.mock.calls) {
            expect(message).toContain(`'${UNKNOWN_STACK}'`);
        }
    });

    it('falls back to the console when no sink is handed in', () => {
        buildProjectConfig({ ...BASE, selectedStack: SHIPPED_STACK });

        expect(consoleWarn).toHaveBeenCalledTimes(1);
        expect(consoleWarn.mock.calls[0][0]).toContain(`'${SHIPPED_STACK}'`);
    });
});
