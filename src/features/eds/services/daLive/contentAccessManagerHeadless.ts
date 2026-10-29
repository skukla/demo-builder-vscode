/**
 * Manage who may READ a storefront's authored content on DA.live — UI-free.
 *
 * The content counterpart of `siteAccessManagerHeadless` (who administers the
 * site's Configuration Service entry). Same shape on purpose: one command and
 * one tool pair sit over each, and the two are the same job on two systems.
 *
 * ## Why this exists
 *
 * "Add a demo someone shared" copies a colleague's storefront from the PUBLIC CDN,
 * so it sees only what they published. Their block library (`.da/library/`) and
 * every unpublished page are invisible without READ on their DA.live site — and
 * DA.live has no in-app way to grant that short of editing a permissions sheet
 * by hand (owner, 2026-09-30: "Khalil doesn't know how to add it by hand").
 *
 * ## The rows, and the trap
 *
 * A read grant is one row in the ORG-level config's `permissions` sheet:
 * `/{site}/+** | email | read`. The moment that sheet holds ANY row, everyone not
 * listed loses access — the owner included, and DA.live's own remedy for that is
 * Adobe Support. So a grant into an org that has no rows yet first writes the
 * owner's own `write` rows (`grantContentRead` does this; the owner is whoever is
 * signed in here). Never replace; always read-merge-write.
 *
 * ## Every mutation is confirmed by a re-read
 *
 * A 200 from the write is not proof the row landed. `verified` is a re-read.
 *
 * Runs in the extension host (needs the DA.live sign-in). The MCP tools reach it
 * through a `HandlerContext`.
 *
 * @module features/eds/services/daLive/contentAccessManagerHeadless
 */

import type * as vscode from 'vscode';
import { DaLiveConfigService, type ContentReader } from './daLiveConfigService';
import { createDaLiveServiceTokenProvider } from './daLiveTokenProviders';
import { maskEmail } from '@/core/utils/maskEmail';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import type { Logger } from '@/types/logger';

/** A DA.live site: the org (here, a GitHub namespace) and the site under it. */
export interface DaSiteTarget {
    org: string;
    site: string;
}

/**
 * Outcomes a caller must tell apart. `no_credential` (sign in to DA.live) is not
 * `not_authorized` (this identity does not own the org, and cannot fix that here).
 */
export type ContentAccessStatus = 'ok' | 'not_authorized' | 'no_credential' | 'invalid' | 'failed';

export interface ContentAccessListing {
    status: ContentAccessStatus;
    org: string;
    site: string;
    /** Everyone with a row on this site's content, and whether they may write or only read. */
    readers?: ContentReader[];
    error?: string;
}

export interface ContentAccessMutation extends ContentAccessListing {
    /** True only when a re-read confirms the intended change actually landed. */
    verified: boolean;
}

/** Cheap sanity check — a typo'd address grants nobody anything. */
export function looksLikeEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function statusOf(error: unknown): { status: ContentAccessStatus; error: string } {
    const message = error instanceof Error ? error.message : String(error);
    // DA.live answers a non-owner's org-config read or write with 401/403.
    const refused = /\b(401|403)\b/u.test(message);
    return { status: refused ? 'not_authorized' : 'failed', error: message };
}

async function serviceFor(
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<{ service: DaLiveConfigService; ownerEmail: string | null } | undefined> {
    const auth = getDaLiveAuthService(context);
    const tokenProvider = createDaLiveServiceTokenProvider(auth);
    if (!(await tokenProvider.getAccessToken())) return undefined;
    return { service: new DaLiveConfigService(tokenProvider, logger), ownerEmail: await auth.getUserEmail() };
}

/** Who may read (or write) this site's authored content, from the org's permissions sheet. */
export async function listContentReaders(
    target: DaSiteTarget,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<ContentAccessListing> {
    const resolved = await serviceFor(context, logger);
    if (!resolved) return { status: 'no_credential', ...target, error: 'no DA.live credential stored' };
    try {
        return { status: 'ok', ...target, readers: await resolved.service.listContentReaders(target.org, target.site) };
    } catch (error) {
        return { ...statusOf(error), ...target };
    }
}

const sameEmail = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Re-read the sheet so a mutation is confirmed rather than trusted. */
async function confirm(
    service: DaLiveConfigService,
    target: DaSiteTarget,
    expect: (readers: ContentReader[]) => boolean,
): Promise<{ readers?: ContentReader[]; verified: boolean }> {
    try {
        const readers = await service.listContentReaders(target.org, target.site);
        return { readers, verified: expect(readers) };
    } catch {
        return { verified: false };
    }
}

/**
 * Let `email` read this site's authored content, then verify it stuck. The
 * signed-in owner's own write rows go in first when the org's sheet is empty.
 */
export async function addContentReader(
    target: DaSiteTarget,
    email: string,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<ContentAccessMutation> {
    if (!looksLikeEmail(email)) {
        return { status: 'invalid', ...target, verified: false, error: 'not an email address' };
    }
    const resolved = await serviceFor(context, logger);
    if (!resolved) return { status: 'no_credential', ...target, verified: false, error: 'no DA.live credential stored' };
    const { service, ownerEmail } = resolved;
    const result = await service.grantContentRead(target.org, target.site, email.trim(), ownerEmail ?? undefined);
    if (!result.success) {
        return { ...statusOf(result.error), ...target, verified: false };
    }
    const { readers, verified } = await confirm(service, target, (list) =>
        list.some((reader) => sameEmail(reader.email, email)),
    );
    if (!verified) {
        logger.warn(`[ContentAccess] ${target.org}/${target.site}: read grant for ${maskEmail(email)} did not verify on re-read`);
    }
    return { status: 'ok', ...target, readers, verified };
}

/** Stop `email` reading this site's content — its read row only; a writer keeps writing. */
export async function removeContentReader(
    target: DaSiteTarget,
    email: string,
    context: vscode.ExtensionContext,
    logger: Logger,
): Promise<ContentAccessMutation> {
    const resolved = await serviceFor(context, logger);
    if (!resolved) return { status: 'no_credential', ...target, verified: false, error: 'no DA.live credential stored' };
    const { service } = resolved;
    const result = await service.revokeContentRead(target.org, target.site, email.trim());
    if (!result.success) {
        return { ...statusOf(result.error), ...target, verified: false };
    }
    const { readers, verified } = await confirm(service, target, (list) =>
        list.every((reader) => reader.actions === 'write' || !sameEmail(reader.email, email)),
    );
    return { status: 'ok', ...target, readers, verified };
}
