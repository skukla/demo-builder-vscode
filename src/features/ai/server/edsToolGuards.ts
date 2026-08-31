/**
 * Shared guard steps for the EDS storefront tools (republish, sync_content,
 * reset_eds_project) — one home for what was the same three blocks written
 * per-tool (2026-08-27 dedup sweep, PL-8 item 2; each block had reached three
 * copies):
 *
 * - {@link requireEdsProject} — current project exists and is an EDS storefront
 * - {@link requireGitHub}     — GitHub token validates, else the `needsAuth`
 *                              handoff (the convention `handoff.ts` documents)
 * - {@link requireDaLive}     — DA.live session live, else the same handoff
 *
 * The refusal MESSAGES are parameterized where the copies differed (the tool
 * name; the "why" clause on the auth asks) so extraction changes no observable
 * text. Guards return the refusal BODY, not a tool result — callers wrap in
 * `asText` so the envelope rule stays visible at the call site.
 *
 * @module features/ai/server/edsToolGuards
 */

import { getDaLiveAuthService, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { isEdsProject } from '@/types/typeGuards';

/**
 * The current project, refused unless it exists and is an EDS storefront.
 *
 * @param ctx - handler context
 * @param toolName - names the tool in the not-EDS refusal, matching the
 *   per-tool wording the copies carried
 * @returns the project, or the refusal body to return via `asText`
 */
export async function requireEdsProject(
    ctx: HandlerContext,
    toolName: string,
): Promise<{ ok: true; project: Project } | { ok: false; body: Record<string, unknown> }> {
    const project = await ctx.stateManager.getCurrentProject();
    if (!project) {
        return { ok: false, body: { error: 'No current project is open' } };
    }
    if (!isEdsProject(project)) {
        return {
            ok: false,
            body: { error: `${toolName} applies only to EDS storefront projects` },
        };
    }
    return { ok: true, project };
}

/**
 * GitHub token check → `needsAuth: 'github'` handoff on failure.
 *
 * @param ctx - handler context
 * @param why - optional clause after "GitHub sign-in required" (e.g.
 *   ' to push config.json'); empty keeps the terse form
 * @returns the refusal body, or undefined when the token validates
 */
export async function requireGitHub(
    ctx: HandlerContext,
    why = '',
): Promise<Record<string, unknown> | undefined> {
    let githubOk = false;
    try {
        githubOk = (await getGitHubServices(ctx.context.secrets).tokenService.validateToken()).valid;
    } catch {
        githubOk = false;
    }
    if (githubOk) {
        return undefined;
    }
    return {
        needsAuth: 'github',
        message:
            `GitHub sign-in required${why}. Check get_auth_status, then ` +
            'sign_in(provider:"github", confirm:true) once the user agrees.',
    };
}

/**
 * DA.live session check → `needsAuth: 'dalive'` handoff on failure.
 *
 * @param ctx - handler context
 * @param why - optional clause after "DA.live sign-in required"
 * @returns the refusal body, or undefined when a session is live
 */
export async function requireDaLive(
    ctx: HandlerContext,
    why = '',
): Promise<Record<string, unknown> | undefined> {
    if (await getDaLiveAuthService(ctx.context).isAuthenticated()) {
        return undefined;
    }
    return {
        needsAuth: 'dalive',
        message:
            `DA.live sign-in required${why}. Check get_auth_status, then ` +
            'sign_in(provider:"dalive", confirm:true) once the user agrees.',
    };
}
