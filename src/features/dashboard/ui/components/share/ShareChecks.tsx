/**
 * Share Demo's checks that need the SC, each an amber notice with its fix: the house
 * `InlineNotice`, its title the extension's when the check has one (walk F227), and Share Datapack
 * on a pack only the SC can see (walk F229). Both steps show them: the link step all of them,
 * the file step the datapack's alone (walk F230), so they live here rather than in either form.
 *
 * @module features/dashboard/ui/components/share/ShareChecks
 */

import { Button } from '@adobe/react-spectrum';
import React from 'react';
import { SHARE_COPY } from './shareCopy';
import type { ShareDatapackFix } from './useShareDatapack';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { DemoPackageCheck } from '@/types/webviewRequests';

/** The notice's line: why its fix failed, when it did, else the check's sentence under its title. */
function noticeLine(check: DemoPackageCheck, fix: ShareDatapackFix): string | undefined {
    if (check.share && fix.reason) return fix.reason;
    return check.title ? check.message : undefined;
}

/**
 * One check that needs the SC, as an amber notice: the extension's title over its sentence, or
 * the sentence alone as a one-line notice when the check carries no title; then its fix. A pack
 * only the SC can see carries Share Datapack (walk F229), busy on the button while it runs.
 */
function CheckNotice({
    check,
    fix,
}: {
    check: DemoPackageCheck;
    fix: ShareDatapackFix;
}): React.ReactElement {
    const hint = check.action === 'republish' ? SHARE_COPY.republishHint : undefined;
    const action = check.share ? (
        <Button variant="secondary" onPress={fix.ask} isPending={fix.pending}>
            {SHARE_COPY.shareDatapack}
        </Button>
    ) : undefined;
    return (
        <InlineNotice
            title={check.title ?? check.message}
            hint={hint}
            action={action}
            testId={`package-check-${check.id}`}
        >
            {noticeLine(check, fix)}
        </InlineNotice>
    );
}

/**
 * Only the checks that need the SC: a list of green ticks is noise (owner, 2026-10-22).
 *
 * @param props.checks - the checks to show from; the passing ones are left out
 * @param props.fix - Share Datapack, for a pack only the SC can see (`useShareDatapack`)
 * @returns the notices, or nothing when every check passes
 */
export function ShareChecks({
    checks,
    fix,
}: {
    checks: DemoPackageCheck[];
    fix: ShareDatapackFix;
}): React.ReactElement | null {
    const open = checks.filter((check) => !check.ok);
    if (open.length === 0) return null;
    return (
        <>
            {open.map((check) => (
                <CheckNotice
                    key={`${check.id}-${check.repository ?? ''}`}
                    check={check}
                    fix={fix}
                />
            ))}
        </>
    );
}
