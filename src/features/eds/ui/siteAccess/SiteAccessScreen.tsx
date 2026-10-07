/**
 * Site access — give someone access to a storefront, or give it back to yourself.
 *
 * Two kinds of access, held in two systems: configuration admin (the AEM
 * Configuration Service entry, which Republish needs to register the product
 * page overlay) and reading the content (the DA.live permissions sheet, which a
 * colleague needs to copy the storefront's blocks and pages, EDS-22). The SC
 * thinks in people, so the screen is ONE list: each person once, with what they
 * hold (`accessRows`), and one Give access dialog that offers both.
 *
 * Giving it back to yourself is the refusal notice at the TOP: the admin role
 * cannot be granted over the API to someone who lacks it, so the notice carries
 * the steps (reinstall AEM Code Sync on GitHub) and "check access".
 *
 * Without a project storefront only the content half applies, for an org and
 * site the SC types: the person sharing need not have built it here.
 *
 * Shared pieces: `PageLayout` + `PageHeader`, `InlineNotice` (via
 * `SiteAccessNoticeView`), `LoadingDisplay` above the list while something runs
 * (the list stays on screen), `EmptyState`, `AddCard`, `CardActionsMenu`, `Modal`.
 *
 * @module features/eds/ui/siteAccess/SiteAccessScreen
 */

import { Button, DialogContainer, Flex, Text, TextField, View } from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useState } from 'react';
import { accessRowsOf, grantChoicesOf, type AccessRemoval } from './accessRows';
import { GiveAccessModal, type Grant } from './GiveAccessModal';
import { PeopleList } from './PeopleList';
import { SiteAccessNoticeView } from './SiteAccessNoticeView';
import { useSiteAccess, type SiteTarget } from './useSiteAccess';
import { EmptyState } from '@/core/ui/components/feedback/EmptyState';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { SiteAccessInitialData, SiteAccessNotice, SiteAccessView } from '@/types/webviewPayloads';

export type SiteAccessScreenProps = Partial<SiteAccessInitialData>;

interface PendingRemoval {
    email: string;
    removal: AccessRemoval;
}

/** "3 people have access". */
function countLine(n: number): string {
    return n === 1 ? '1 person has access' : `${n} people have access`;
}

/** Why a list cannot be read or changed, each said once, in list order. */
function listNotices(view: SiteAccessView | null): SiteAccessNotice[] {
    return [view?.admins?.notice, view?.readers?.notice].filter(
        (notice): notice is SiteAccessNotice => Boolean(notice),
    );
}

/** The DA.live org and site to show, when no project storefront names one. */
function SiteTargetForm({ isBusy, onShow }: {
    isBusy: boolean;
    onShow: (target: SiteTarget) => void;
}): React.ReactElement {
    const [org, setOrg] = useState('');
    const [site, setSite] = useState('');
    const isEmpty = org.trim() === '' || site.trim() === '';
    return (
        <Flex gap="size-100" alignItems="end" wrap marginBottom="size-300">
            <TextField label="DA.live organization" value={org} onChange={setOrg} isDisabled={isBusy} />
            <TextField label="Site" value={site} onChange={setSite} isDisabled={isBusy} />
            <Button
                variant="accent"
                isDisabled={isBusy || isEmpty}
                onPress={() => onShow({ org: org.trim(), site: site.trim() })}
            >
                Show Access
            </Button>
        </Flex>
    );
}

export function SiteAccessScreen({ projectName, hasStorefront }: SiteAccessScreenProps): React.ReactElement {
    const { view, notice, busy, progress, load, change, waitForAccess, openLink, repair } = useSiteAccess();
    const [target, setTarget] = useState<SiteTarget | undefined>(undefined);
    const [giving, setGiving] = useState(false);
    const [pending, setPending] = useState<PendingRemoval | null>(null);

    useEffect(() => {
        if (hasStorefront) void load();
    }, [hasStorefront, load]);

    const rows = useMemo(() => accessRowsOf(view), [view]);
    const choices = grantChoicesOf(view);
    const canGive = choices.admin || choices.read;
    const isBusy = busy !== null;
    const noticeActions = { isBusy, onOpenLink: openLink, onWait: () => void waitForAccess(), onRepair: repair };
    const notices = [...(notice ? [notice] : []), ...listNotices(view)];

    const showSite = (typed: SiteTarget): void => {
        setTarget(typed);
        void load(typed);
    };
    const give = async ({ email, admin, read }: Grant): Promise<void> => {
        setGiving(false);
        if (admin && !(await change('addSiteAdmin', email))) return;
        if (read) await change('addContentReader', email, target);
    };
    const confirmRemoval = (): void => {
        if (!pending) return;
        setPending(null);
        void change(pending.removal.type, pending.email, target);
    };

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Site Access"
                    subtitle={hasStorefront ? projectName : 'Who reads a DA.live site’s content'}
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            <div className="page-container-padded pb-6">
                {/* Off the header's rule, as the other pages' first band sits. */}
                <View paddingTop="size-300">
                    {!hasStorefront && <SiteTargetForm isBusy={isBusy} onShow={showSite} />}
                    {notices.map((shown) => (
                        <View key={shown.message} marginBottom="size-200">
                            <SiteAccessNoticeView notice={shown} {...noticeActions} />
                        </View>
                    ))}
                    {busy && <LoadingDisplay message={busy} subMessage={progress ?? undefined} />}
                    {view && (
                        <>
                            <View marginBottom="size-200">
                                <Text UNSAFE_className="text-sm text-gray-600">{countLine(rows.length)}</Text>
                            </View>
                            {rows.length === 0 && !canGive ? (
                                <EmptyState
                                    title="Nobody to show"
                                    description="No one has access you can see, and you cannot give access here."
                                />
                            ) : (
                                <PeopleList
                                    rows={rows}
                                    canGive={canGive && !isBusy}
                                    onGive={() => setGiving(true)}
                                    onRemove={(email, removal) => setPending({ email, removal })}
                                />
                            )}
                        </>
                    )}
                </View>
            </div>
            <GiveAccessModal
                isOpen={giving}
                choices={choices}
                onGive={(grant) => void give(grant)}
                onClose={() => setGiving(false)}
            />
            <DialogContainer type="modal" onDismiss={() => setPending(null)}>
                {pending && (
                    <Modal
                        title={`${pending.removal.label}?`}
                        size="S"
                        onClose={() => setPending(null)}
                        closeLabel="Cancel"
                        actionButtons={[{ label: 'Remove', variant: 'negative', onPress: confirmRemoval }]}
                    >
                        <Text>
                            {pending.email} will no longer {pending.removal.consequence}. You can give it back at any
                            time.
                        </Text>
                    </Modal>
                )}
            </DialogContainer>
        </PageLayout>
    );
}
