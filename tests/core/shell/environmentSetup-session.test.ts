/**
 * EnvironmentSetup — the session decisions
 *
 * The telemetry re-entrancy guard. The configuration suite proves the happy
 * path; these pin what is decided along the way — which collaborator is NOT
 * called, and what happens after a failure.
 */
import * as os from 'os';
import type { CommandResult, ExecuteOptions } from '@/core/shell/types';
import { EnvironmentSetup } from '@/core/shell/environmentSetup';
import { createEnvironmentSetup, resetAllMocks } from './environmentSetup.testUtils';

jest.mock('fs');
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
    platform: jest.fn(() => process.platform),
}));
jest.mock('child_process', () => ({
    execSync: jest.fn(),
}));

const HOME = '/mock/home';
type Execute = (command: string, options?: ExecuteOptions) => Promise<CommandResult>;

const ok = (stdout = ''): CommandResult =>
    ({ code: 0, stdout, stderr: '', success: true }) as unknown as CommandResult;

/** The two statics EnvironmentSetup memoises telemetry state in. */
const statics = () =>
    EnvironmentSetup as unknown as { telemetryConfigured: boolean; checkingTelemetry: boolean };

describe('EnvironmentSetup — session decisions', () => {
    let environmentSetup: EnvironmentSetup;

    beforeEach(() => {
        resetAllMocks();
        (os.homedir as jest.Mock).mockReturnValue(HOME);
        environmentSetup = createEnvironmentSetup(HOME);
    });

    describe('opting out of Adobe CLI telemetry', () => {
        it('sends the opt-out without asking for telemetry on the way', async () => {
            const fn = jest.fn(async () => ok());

            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledWith('aio config set aio-cli-telemetry.optOut true', {
                configureTelemetry: false,
                encoding: 'utf8',
                timeout: 5000,
            });
        });

        it('does not try again after a non-zero exit', async () => {
            const fn = jest.fn(async () => ({ code: 1, stdout: '', stderr: 'boom' }) as
                unknown as CommandResult);

            await environmentSetup.ensureAdobeCLIConfigured(fn);
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('does not try again after the command throws', async () => {
            const fn = jest.fn(async () => {
                throw new Error('aio missing');
            });

            await environmentSetup.ensureAdobeCLIConfigured(fn);
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('refuses to re-enter while a configure is still in flight', async () => {
            // Bounded on purpose: without the flag a broken guard recurses until the
            // stack gives out, and a worker that dies is not a test that failed.
            let reentered = false;
            const fn: jest.Mock = jest.fn(async () => {
                if (!reentered) {
                    reentered = true;
                    await environmentSetup.ensureAdobeCLIConfigured(fn as unknown as Execute);
                }
                return ok();
            });

            await environmentSetup.ensureAdobeCLIConfigured(fn as unknown as Execute);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('starts a fresh extension host with telemetry not yet configured', async () => {
            await jest.isolateModulesAsync(async () => {
                const fresh = require('@/core/shell/environmentSetup') as {
                    EnvironmentSetup: typeof EnvironmentSetup;
                };
                const fn = jest.fn(async () => ok());

                await new fresh.EnvironmentSetup().ensureAdobeCLIConfigured(fn);

                expect(fn).toHaveBeenCalledTimes(1);
            });
        });

        it('clears the in-flight guard when it is done', async () => {
            const fn = jest.fn(async () => ok());
            await environmentSetup.ensureAdobeCLIConfigured(fn);
            expect(statics().checkingTelemetry).toBe(false);

            statics().telemetryConfigured = false;
            await environmentSetup.ensureAdobeCLIConfigured(fn);

            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

});
