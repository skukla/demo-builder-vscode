/**
 * A Site access notice with what the SC can do about it: open the GitHub page
 * that fixes it, check whether the fix has landed, or repair the refused
 * configuration write.
 *
 * Built on the shared `InlineNotice`; it has two tones, so success reads as
 * info and anything to act on reads as a warning.
 *
 * @module features/eds/ui/siteAccess/SiteAccessNoticeView
 */

import { Button, Flex } from '@adobe/react-spectrum';
import React from 'react';
import { InlineNotice } from '@/core/ui/components/feedback/InlineNotice';
import type { SiteAccessLink, SiteAccessNotice } from '@/types/webviewPayloads';

const TITLES: Record<SiteAccessNotice['tone'], string> = {
    success: 'Done',
    warning: 'Needs attention',
    error: 'That did not go through',
};

export interface SiteAccessNoticeViewProps {
    notice: SiteAccessNotice;
    isBusy: boolean;
    onOpenLink: (id: SiteAccessLink['id']) => void;
    onWait: () => void;
    onRepair: () => void;
}

export function SiteAccessNoticeView({
    notice,
    isBusy,
    onOpenLink,
    onWait,
    onRepair,
}: SiteAccessNoticeViewProps): React.ReactElement {
    const hasActions = Boolean(notice.links?.length) || notice.offerWait || notice.offerRepair;
    return (
        <InlineNotice
            title={TITLES[notice.tone]}
            tone={notice.tone === 'success' ? 'info' : 'warning'}
            testId="site-access-notice"
            actionBelow
            action={
                hasActions ? (
                    <Flex gap="size-100" wrap>
                        {notice.links?.map((link) => (
                            <Button key={link.id} variant="secondary" onPress={() => onOpenLink(link.id)}>
                                {link.label}
                            </Button>
                        ))}
                        {notice.offerWait && (
                            <Button variant="accent" isDisabled={isBusy} onPress={onWait}>
                                I&apos;ve done that — check access
                            </Button>
                        )}
                        {notice.offerRepair && (
                            <Button variant="accent" isDisabled={isBusy} onPress={onRepair}>
                                Repair Site Configuration
                            </Button>
                        )}
                    </Flex>
                ) : undefined
            }
        >
            {notice.message}
        </InlineNotice>
    );
}
