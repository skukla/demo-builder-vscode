/**
 * ProcessCleanup — the decisions, driven deterministically.
 *
 * The sibling suites spawn real children, which is what makes them slow and what
 * makes them unable to say "and then nothing else happened": a cleared interval and
 * a leaked one look identical unless you advance the clock and count the syscalls.
 * Everything here asserts what ProcessCleanup DID to the process table — which
 * signal reached which pid, at what point on the clock, and how many times — rather
 * than what it logged.
 */

const mockTreeKill = jest.fn();
jest.mock('tree-kill', () => mockTreeKill);

import { ProcessCleanup } from '@/core/shell/processCleanup';

type Signal = NodeJS.Signals | number;
interface KillCall {
    pid: number;
    signal: Signal;
}

/** The 100ms poll in TIMEOUTS.POLL.PROCESS_CHECK, restated so the clock maths reads. */
const POLL_MS = 100;

let originalKill: typeof process.kill;
let killCalls: KillCall[];

function esrch(): NodeJS.ErrnoException {
    const error = new Error('No such process') as NodeJS.ErrnoException;
    error.code = 'ESRCH';
    return error;
}

function eperm(): NodeJS.ErrnoException {
    const error = new Error('Operation not permitted') as NodeJS.ErrnoException;
    error.code = 'EPERM';
    return error;
}

/** Install a process.kill fake; every call is recorded before `handler` decides. */
function installKill(handler: (pid: number, signal: Signal) => boolean): void {
    process.kill = jest.fn((pid: number, signal: Signal = 'SIGTERM') => {
        killCalls.push({ pid, signal });
        return handler(pid, signal);
    }) as unknown as typeof process.kill;
}

/** A process table: signal 0 reports existence, SIGTERM/SIGKILL remove the pid. */
function installTable(alive: number[]): Set<number> {
    const live = new Set(alive);
    installKill((pid, signal) => {
        if (!live.has(pid)) {
            throw esrch();
        }
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            live.delete(pid);
        }
        return true;
    });
    return live;
}

/** A process that ignores SIGTERM. `diesOnSigkill` decides whether SIGKILL lands. */
function installStubborn(diesOnSigkill: boolean): { killed: () => boolean } {
    let dead = false;
    installKill((_pid, signal) => {
        if (dead) {
            throw esrch();
        }
        if (signal === 'SIGKILL' && diesOnSigkill) {
            dead = true;
        }
        return true;
    });
    return { killed: () => dead };
}

/** tree-kill reports the signal as delivered, leaving the poll to observe the exit. */
function treeKillSucceeds(): void {
    mockTreeKill.mockImplementation((_pid: number, _signal: string, cb: (e?: Error) => void) =>
        cb(),
    );
}

function withoutTreeKill(cleanup: ProcessCleanup): ProcessCleanup {
    jest.spyOn(
        cleanup as unknown as { isTreeKillAvailable(): boolean },
        'isTreeKillAvailable',
    ).mockReturnValue(false);
    return cleanup;
}

const signalsSent = (): Signal[] => killCalls.filter((c) => c.signal !== 0).map((c) => c.signal);

/**
 * Hold a call's outcome from the moment it starts.
 *
 * A mutant can make killProcessTree reject immediately. If the test then fails on an
 * assertion made BEFORE it awaits, the rejection is never handled and Node takes the
 * whole worker down — which a mutation run scores as an error rather than as a kill.
 */
function watch(promise: Promise<void>): Promise<{ ok: boolean; error?: unknown }> {
    return promise.then(
        () => ({ ok: true }),
        (error: unknown) => ({ ok: false, error }),
    );
}

describe('ProcessCleanup — decisions', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        originalKill = process.kill;
        killCalls = [];
        treeKillSucceeds();
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        process.kill = originalKill;
    });

    describe('deciding whether the process is there at all', () => {
        it('treats ESRCH on the existence probe as gone and kills nothing', async () => {
            installTable([]);

            await new ProcessCleanup().killProcessTree(1000, 'SIGTERM');

            expect(mockTreeKill).not.toHaveBeenCalled();
            expect(signalsSent()).toEqual([]);
        });

        /**
         * The first existence probe throws `oddity`; every later one reports the
         * process gone, so the call finishes instead of leaving a poll running. That
         * matters: a probe that throws from INSIDE the poll is an uncaught exception in
         * a timer callback, which takes the whole worker down rather than failing a
         * test — and a mutation run reads that as an error, not as a kill.
         */
        function probeThrowsOnce(
            pid: number,
            oddity: unknown,
        ): { done: Promise<void>; failure: () => unknown } {
            let probes = 0;
            installKill((_pid, signal) => {
                if (signal === 0) {
                    probes += 1;
                    if (probes === 1) {
                        throw oddity;
                    }
                    throw esrch();
                }
                return true;
            });
            let failure: unknown;
            // The rejection handler is attached BEFORE any assertion runs. A mutant that
            // makes this call reject would otherwise leave the rejection unhandled while
            // an earlier expect() fails the test, and Node exits the worker on that.
            const done = new ProcessCleanup({ gracefulTimeout: 1000 })
                .killProcessTree(pid)
                .catch((error: unknown) => {
                    failure = error;
                });
            return { done, failure: () => failure };
        }

        it('treats EPERM on the existence probe as present and proceeds to kill', async () => {
            const run = probeThrowsOnce(2000, eperm());

            expect(mockTreeKill).toHaveBeenCalledWith(2000, 'SIGTERM', expect.any(Function));
            jest.advanceTimersByTime(POLL_MS);
            await run.done;
            expect(run.failure()).toBeUndefined();
        });

        it('treats a thrown non-object as present rather than reading .code off it', async () => {
            // getErrorCode duck-types instead of using instanceof; handed a string it must
            // answer undefined, not attempt `'code' in 'ESRCH'`, which is a TypeError.
            const run = probeThrowsOnce(3000, 'ESRCH');

            expect(mockTreeKill).toHaveBeenCalledWith(3000, 'SIGTERM', expect.any(Function));
            jest.advanceTimersByTime(POLL_MS);
            await run.done;
            expect(run.failure()).toBeUndefined();
        });

        it('treats a thrown null as present rather than reading .code off it', async () => {
            const run = probeThrowsOnce(4000, null);

            expect(mockTreeKill).toHaveBeenCalledWith(4000, 'SIGTERM', expect.any(Function));
            jest.advanceTimersByTime(POLL_MS);
            await run.done;
            expect(run.failure()).toBeUndefined();
        });
    });

    describe('the logger it writes through', () => {
        it('resolves the logger once and reuses it', async () => {
            await jest.isolateModulesAsync(async () => {
                const logging = require('@/core/logging/debugLogger') as {
                    getLogger: jest.Mock;
                };
                const fresh = require('@/core/shell/processCleanup') as {
                    ProcessCleanup: typeof ProcessCleanup;
                };
                installTable([]);
                const cleanup = new fresh.ProcessCleanup();

                await cleanup.killProcessTree(1000);
                await cleanup.killProcessTree(2000);

                expect(logging.getLogger).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('the tree-kill path', () => {
        it('hands tree-kill the pid and the caller’s signal, not a substitute', async () => {
            const live = installTable([1000]);

            const outcome = watch(
                new ProcessCleanup({ gracefulTimeout: 10_000 }).killProcessTree(1000, 'SIGHUP'),
            );
            expect(mockTreeKill).toHaveBeenCalledWith(1000, 'SIGHUP', expect.any(Function));

            live.delete(1000);
            jest.advanceTimersByTime(POLL_MS);
            expect(await outcome).toEqual({ ok: true });
        });

        it('rejects with tree-kill’s own error when it is not an ESRCH race', async () => {
            const failure = new Error('EPERM: operation not permitted');
            mockTreeKill.mockImplementation((_p: number, _s: string, cb: (e?: Error) => void) =>
                cb(failure),
            );
            installTable([1000]);

            await expect(new ProcessCleanup().killProcessTree(1000)).rejects.toBe(failure);
            expect(signalsSent()).toEqual([]);
        });

        it('treats an ESRCH from tree-kill as success and stops there', async () => {
            mockTreeKill.mockImplementation((_p: number, _s: string, cb: (e?: Error) => void) =>
                cb(new Error('kill ESRCH')),
            );
            installTable([1000]);

            await new ProcessCleanup({ gracefulTimeout: 500 }).killProcessTree(1000);
            const after = killCalls.length;
            jest.advanceTimersByTime(5000);

            expect(killCalls).toHaveLength(after);
        });

        it('keeps polling while the process is still there, then stops', async () => {
            const live = installTable([1000]);
            const promise = new ProcessCleanup({ gracefulTimeout: 10_000 }).killProcessTree(1000);
            let settled = false;
            void promise.then(
                () => {
                    settled = true;
                },
                () => undefined,
            );

            jest.advanceTimersByTime(POLL_MS * 2);
            await Promise.resolve();
            expect(settled).toBe(false);

            live.delete(1000);
            jest.advanceTimersByTime(POLL_MS);
            await promise;

            const after = killCalls.length;
            jest.advanceTimersByTime(POLL_MS * 20);
            expect(killCalls).toHaveLength(after);
        });

        it('cancels the force-kill deadline when the process exits gracefully', async () => {
            const live = installTable([1000]);
            const promise = new ProcessCleanup({ gracefulTimeout: 1000 }).killProcessTree(1000);

            live.delete(1000);
            jest.advanceTimersByTime(POLL_MS);
            await promise;

            jest.advanceTimersByTime(5000);
            expect(signalsSent()).toEqual([]);
        });

        it('cannot SIGKILL a pid it has finished with, even once the pid is reused', async () => {
            // Clearing the deadline is the only thing that makes this safe. Left armed, it
            // fires after the call resolved, finds "a process" at that pid — by then some
            // unrelated one the OS handed the number to — and kills it.
            let gone = false;
            installKill((_pid, signal) => {
                if (signal === 0 && gone) {
                    throw esrch();
                }
                return true;
            });
            const promise = new ProcessCleanup({ gracefulTimeout: 1000 }).killProcessTree(1000);

            gone = true;
            jest.advanceTimersByTime(POLL_MS);
            await promise;

            gone = false; // the pid is handed to something else
            jest.advanceTimersByTime(2000);
            expect(signalsSent()).toEqual([]);
        });

        it('sends no SIGKILL when the process exits exactly on the deadline', async () => {
            // 250ms is deliberately not a multiple of the 100ms poll: the polls at 100 and
            // 200 see it alive, and the deadline at 250 finds it gone.
            const live = installTable([1000]);
            const promise = new ProcessCleanup({ gracefulTimeout: 250 }).killProcessTree(1000);

            jest.advanceTimersByTime(200);
            live.delete(1000);
            jest.advanceTimersByTime(50);
            await promise;

            expect(signalsSent()).toEqual([]);
        });

        it('sends SIGKILL to the same pid when the deadline finds it alive', async () => {
            const stubborn = installStubborn(true);
            const outcome = watch(
                new ProcessCleanup({ gracefulTimeout: 250 }).killProcessTree(1000),
            );

            jest.advanceTimersByTime(250);
            expect(killCalls).toContainEqual({ pid: 1000, signal: 'SIGKILL' });

            jest.advanceTimersByTime(POLL_MS);
            expect(await outcome).toEqual({ ok: true });
            expect(stubborn.killed()).toBe(true);
        });

        it('swallows an ESRCH from the force SIGKILL and lets the poll finish', async () => {
            let sigkillAttempted = false;
            installKill((_pid, signal) => {
                if (signal === 0) {
                    if (sigkillAttempted) {
                        throw esrch();
                    }
                    return true;
                }
                sigkillAttempted = true;
                throw esrch();
            });

            const outcome = watch(
                new ProcessCleanup({ gracefulTimeout: 250 }).killProcessTree(1000),
            );
            jest.advanceTimersByTime(250);
            expect(killCalls).toContainEqual({ pid: 1000, signal: 'SIGKILL' });

            jest.advanceTimersByTime(POLL_MS);
            expect(await outcome).toEqual({ ok: true });
        });
    });

    describe('the fallback path, when tree-kill is unavailable', () => {
        it('sends the caller’s signal directly to the pid', async () => {
            const live = installTable([1000]);
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            await cleanup.killProcessTree(1000, 'SIGTERM');

            expect(killCalls).toContainEqual({ pid: 1000, signal: 'SIGTERM' });
            expect(mockTreeKill).not.toHaveBeenCalled();
            expect(live.has(1000)).toBe(false);
        });

        it('resolves without polling when the initial signal races an exit', async () => {
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                throw esrch();
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            await cleanup.killProcessTree(1000, 'SIGTERM');

            const after = killCalls.length;
            jest.advanceTimersByTime(5000);
            expect(killCalls).toHaveLength(after);
        });

        it('wraps a permission failure with the pid, the cause and the original code', async () => {
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                throw eperm();
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            const error = await cleanup
                .killProcessTree(1000, 'SIGTERM')
                .then(() => undefined)
                .catch((e: NodeJS.ErrnoException) => e);

            expect(error?.message).toBe('Failed to kill process 1000: Operation not permitted');
            expect(error?.code).toBe('EPERM');
        });

        it('stringifies a thrown non-object cause and leaves the code unset', async () => {
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                throw 'boom';
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            const error = await cleanup
                .killProcessTree(1000, 'SIGTERM')
                .then(() => undefined)
                .catch((e: NodeJS.ErrnoException) => e);

            expect(error?.message).toBe('Failed to kill process 1000: boom');
            expect(Object.prototype.hasOwnProperty.call(error, 'code')).toBe(false);
        });

        it('stops the poll and the deadline once the process is gone', async () => {
            const live = installTable([1000]);
            live.add(1000);
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            await cleanup.killProcessTree(1000, 'SIGTERM');

            const after = killCalls.length;
            jest.advanceTimersByTime(5000);
            expect(killCalls).toHaveLength(after);
            expect(signalsSent()).toEqual(['SIGTERM']);
        });

        it('waits for a later exit, then cancels both the poll and the deadline', async () => {
            let polls = 0;
            installKill((_pid, signal) => {
                if (signal === 0) {
                    polls += 1;
                    // Alive for the immediate check and the first two polls.
                    if (polls > 3) {
                        throw esrch();
                    }
                    return true;
                }
                return true;
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 10_000 }));

            const promise = cleanup.killProcessTree(1000, 'SIGTERM');
            let settled = false;
            void promise.then(
                () => {
                    settled = true;
                },
                () => undefined,
            );

            jest.advanceTimersByTime(POLL_MS * 2);
            await Promise.resolve();
            expect(settled).toBe(false);

            jest.advanceTimersByTime(POLL_MS);
            await promise;

            const after = killCalls.length;
            jest.advanceTimersByTime(20_000);
            expect(killCalls).toHaveLength(after);
            expect(signalsSent()).toEqual(['SIGTERM']);
        });

        it('reports a message-less cause by stringifying the cause itself', async () => {
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                throw { code: 'EPERM' };
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            const error = await cleanup
                .killProcessTree(1000, 'SIGTERM')
                .then(() => undefined)
                .catch((e: NodeJS.ErrnoException) => e);

            expect(error?.message).toBe('Failed to kill process 1000: [object Object]');
            expect(error?.code).toBe('EPERM');
        });

        it('reports a null cause as "null" rather than reading .message off it', async () => {
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                throw null;
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 1000 }));

            const error = await cleanup
                .killProcessTree(1000, 'SIGTERM')
                .then(() => undefined)
                .catch((e: NodeJS.ErrnoException) => e);

            expect(error?.message).toBe('Failed to kill process 1000: null');
        });

        it('schedules no force-kill when the caller already asked for SIGKILL', () => {
            installStubborn(false);
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 250 }));

            cleanup.killProcessTree(1000, 'SIGKILL').catch(() => undefined);
            jest.advanceTimersByTime(60_000);

            expect(signalsSent()).toEqual(['SIGKILL']);
        });

        it('schedules no force-kill when the graceful window is zero', () => {
            installStubborn(false);
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 0 }));

            cleanup.killProcessTree(1000, 'SIGTERM').catch(() => undefined);
            jest.advanceTimersByTime(60_000);

            expect(signalsSent()).toEqual(['SIGTERM']);
        });

        it('waits the configured window, then SIGKILLs the same pid', () => {
            installStubborn(false);
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 300 }));

            cleanup.killProcessTree(1000, 'SIGTERM').catch(() => undefined);
            jest.advanceTimersByTime(299);
            expect(signalsSent()).toEqual(['SIGTERM']);

            jest.advanceTimersByTime(1);
            expect(killCalls).toContainEqual({ pid: 1000, signal: 'SIGKILL' });
        });

        it('waits five seconds when no window was configured', () => {
            installStubborn(false);
            const cleanup = withoutTreeKill(new ProcessCleanup());

            cleanup.killProcessTree(1000, 'SIGTERM').catch(() => undefined);
            jest.advanceTimersByTime(4999);
            expect(signalsSent()).toEqual(['SIGTERM']);

            jest.advanceTimersByTime(1);
            expect(killCalls).toContainEqual({ pid: 1000, signal: 'SIGKILL' });
        });

        it('resolves when the force SIGKILL finds the process already gone', async () => {
            let sigtermSent = false;
            installKill((_pid, signal) => {
                if (signal === 0) {
                    return true;
                }
                if (signal === 'SIGTERM') {
                    sigtermSent = true;
                    return true;
                }
                throw esrch();
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 250 }));

            const promise = cleanup.killProcessTree(1000, 'SIGTERM');
            jest.advanceTimersByTime(250);

            await expect(promise).resolves.toBeUndefined();
            expect(sigtermSent).toBe(true);
        });

        it('rejects with a force-kill message when SIGKILL fails for another reason', async () => {
            installKill((_pid, signal) => {
                if (signal === 0 || signal === 'SIGTERM') {
                    return true;
                }
                throw eperm();
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 250 }));

            const promise = cleanup.killProcessTree(1000, 'SIGTERM');
            jest.advanceTimersByTime(250);

            await expect(promise).rejects.toThrow(
                'Failed to force-kill process 1000: Operation not permitted',
            );
        });

        it('stops polling after a failed force-kill', async () => {
            installKill((_pid, signal) => {
                if (signal === 0 || signal === 'SIGTERM') {
                    return true;
                }
                throw eperm();
            });
            const cleanup = withoutTreeKill(new ProcessCleanup({ gracefulTimeout: 250 }));

            const promise = cleanup.killProcessTree(1000, 'SIGTERM');
            jest.advanceTimersByTime(250);
            await expect(promise).rejects.toThrow(/force-kill/);

            const after = killCalls.length;
            jest.advanceTimersByTime(POLL_MS * 20);
            expect(killCalls).toHaveLength(after);
        });
    });
});
