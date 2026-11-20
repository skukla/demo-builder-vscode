/**
 * A creation's stop, registered by its project folder for the whole run (F275).
 *
 * An agent's Edge Delivery creation sets up its storefront before creation proper
 * starts. Until 2026-11-18 only creation registered a stop, so `cancel_project_creation`
 * during storefront setup answered "no creation running" and the repository and DA.live
 * site were still made. Now the door claims the stop when the run starts; storefront
 * setup and creation each join the one it holds.
 */

import { claimCreationStop, stopCreation } from '@/features/project-creation/handlers/creationStop';

const FOLDER = '/projects/stop-registry';

describe('claimCreationStop', () => {
    it('registers a stop that stopCreation reaches, until it is released', () => {
        const stop = claimCreationStop(FOLDER);
        expect(stopCreation(FOLDER)).toBe(true);
        expect(stop.signal.aborted).toBe(true);
        stop.release();
        expect(stopCreation(FOLDER)).toBe(false);
    });

    it('joins the stop already held for the folder, so one stop reaches every part of the run', () => {
        const run = claimCreationStop(FOLDER);
        const setup = claimCreationStop(FOLDER);
        setup.release(); // the part that joined does not end the run's stop
        expect(stopCreation(FOLDER)).toBe(true);
        expect(setup.signal.aborted).toBe(true);
        expect(run.signal.aborted).toBe(true);
        run.release();
        expect(stopCreation(FOLDER)).toBe(false);
    });

    it('starts a fresh stop when the one held was already used, and leaves the fresh one registered', () => {
        const old = claimCreationStop(FOLDER);
        stopCreation(FOLDER);
        const fresh = claimCreationStop(FOLDER);
        expect(fresh.signal.aborted).toBe(false);
        old.release(); // the stopped run ending does not unregister the new one
        expect(stopCreation(FOLDER)).toBe(true);
        fresh.release();
    });
});
