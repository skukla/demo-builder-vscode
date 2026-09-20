/**
 * surfaceShowsItself — run something whose progress is ALREADY on screen.
 *
 * Start, stop and restart are short (10 seconds is fine — owner, 2026-09-19) and
 * the tile that started them already says "Starting…" while they run. The
 * command behind each one opens a notification of its own, so pressing Start
 * gave the SC two things saying the same thing, one of them slower (PL-59 R5).
 *
 * It works through the phase channel rather than a flag on every command:
 * `BaseCommand.withProgress` already stands down when something else is
 * narrating — that is what lets a command report into a progress modal (R7) or
 * an agent's notification (R3). A sink that discards is the third case: the
 * surface is showing it, and nothing else needs to.
 *
 * Under an AGENT the sinks are already live and are left alone — an agent has no
 * tile to read, and taking its lines away is the opposite of what R3 asks for.
 *
 * @module core/vscode/surfaceShowsItself
 */

import { hasActivePhaseSinks, withPhaseSinks } from '@/core/utils/agentPhaseChannel';

/**
 * @param run - the work; its nested progress notifications stand down
 * @returns whatever `run` resolves to
 */
export function surfaceShowsItself<T>(run: () => Promise<T>): Promise<T> {
    if (hasActivePhaseSinks()) return run();
    return withPhaseSinks([() => undefined], run);
}
