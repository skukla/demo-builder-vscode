/**
 * How long each step of an engine job took, in Debug Logs (walk F112, owner 2026-11-09: "look at the
 * logs to see what's going on rather than guessing"). A restore left 2 min 21 s with no line at all
 * between its start and its first delete, so nothing could say what it was spent on.
 *
 * @module features/data-installer/services/demoBuilderEngine/jobClock
 */

/** Logs each step with the seconds since the job began: "Removal of my-luma: decided at 12.3 s". */
export function jobClock(log: (line: string) => void, job: string): (step: string) => void {
    const started = Date.now();
    return (step) => log(`${job}: ${step} at ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

/** Runs `work` and logs how long it took: "Install of my-luma: read the datapack in 4.2 s". */
export async function timed<T>(log: (line: string) => void, what: string, work: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const result = await work();
    log(`${what} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    return result;
}
