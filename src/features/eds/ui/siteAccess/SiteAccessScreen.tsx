/**
 * Site access — who administers a storefront and who reads its content.
 *
 * Replaced the Manage Site Access QuickPick, which put two lists, an add, a
 * remove, a GitHub remedy and a two-minute wait into a chain of pickers and
 * toasts. Here they sit on one page and stay there between actions.
 *
 * With a project storefront open it shows both lists for that site. Without
 * one, only the content half applies, for an org and site the SC types: the
 * person sharing a storefront need not have built it with Demo Builder.
 *
 * Composed from the shared vocabulary (`reuse-first`): `PageLayout` +
 * `PageHeader`, `ConfigSection` per list, `InlineNotice` for every notice,
 * `LoadingDisplay` while something runs, and the shared `Modal` to confirm a
 * removal.
 *
 * @module features/eds/ui/siteAccess/SiteAccessScreen
 */

import { Button, DialogContainer, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { PeopleSection } from './PeopleSection';
import { SiteAccessNoticeView } from './SiteAccessNoticeView';
import { useSiteAccess, type ChangeType, type SiteTarget } from './useSiteAccess';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { Modal } from '@/core/ui/components/ui/Modal';
import type { SiteAccessInitialData } from '@/types/webviewPayloads';

export type SiteAccessScreenProps = Partial<SiteAccessInitialData>;

interface PendingRemoval {
    type: Extract<ChangeType, 'removeSiteAdmin' | 'removeContentReader'>;
    email: string;
    what: string;
}

export function SiteAccessScreen({ projectName, hasStorefront }: SiteAccessScreenProps): React.ReactElement {
    const access = useSiteAccess();
    const { view, notice, busy, progress, load, change, waitForAccess, openLink, repair } = access;
    const [org, setOrg] = useState('');
    const [site, setSite] = useState('');
    const [target, setTarget] = useState<SiteTarget | undefined>(undefined);
    const [pending, setPending] = useState<PendingRemoval | null>(null);

    useEffect(() => {
        if (hasStorefront) void load();
    }, [hasStorefront, load]);

    const showSite = (): void => {
        const typed = { org: org.trim(), site: site.trim() };
        setTarget(typed);
        void load(typed);
    };

    const confirmRemoval = (): void => {
        if (!pending) return;
        const { type, email } = pending;
        setPending(null);
        void change(type, email, target);
    };

    const isBusy = busy !== null;
    const sharedActions = { isBusy, onOpenLink: openLink, onWait: () => void waitForAccess(), onRepair: repair };

    return (
        <PageLayout
            header={
                <PageHeader
                    title="Site Access"
                    subtitle={
                        hasStorefront
                            ? `Who administers ${projectName}'s storefront, and who reads its content`
                            : 'Who reads a DA.live site\u2019s content'
                    }
                    constrainWidth
                />
            }
            backgroundColor="var(--spectrum-global-color-gray-50)"
        >
            <div className="page-container-padded">
                <Flex direction="column" gap="size-300">
                    {!hasStorefront && (
                        <Flex gap="size-100" alignItems="end" wrap>
                            <TextField label="DA.live organization" value={org} onChange={setOrg} isDisabled={isBusy} />
                            <TextField label="Site" value={site} onChange={setSite} isDisabled={isBusy} />
                            <Button
                                variant="accent"
                                isDisabled={isBusy || org.trim() === '' || site.trim() === ''}
                                onPress={showSite}
                            >
                                Show Access
                            </Button>
                        </Flex>
                    )}
                    {notice && <SiteAccessNoticeView notice={notice} {...sharedActions} />}
                    {busy && <LoadingDisplay message={busy} subMessage={progress ?? undefined} />}
                    {!busy && view?.admins && (
                        <PeopleSection
                            id="site-admins"
                            label={`Who administers ${view.admins.site}`}
                            list={view.admins}
                            emptyText="No site admins yet."
                            addLabel="Add a configuration admin"
                            onAdd={(email) => change('addSiteAdmin', email)}
                            onRemove={(email) =>
                                setPending({ type: 'removeSiteAdmin', email, what: 'a configuration admin' })
                            }
                            {...sharedActions}
                        />
                    )}
                    {!busy && view?.readers && (
                        <PeopleSection
                            id="content-readers"
                            label={`Who reads ${view.readers.site}'s content`}
                            list={view.readers}
                            emptyText="Nobody has been given read access yet."
                            addLabel="Add a content reader"
                            showDivider={Boolean(view.admins)}
                            onAdd={(email) => change('addContentReader', email, target)}
                            onRemove={(email) =>
                                setPending({ type: 'removeContentReader', email, what: 'a content reader' })
                            }
                            {...sharedActions}
                        />
                    )}
                </Flex>
            </div>
            <DialogContainer type="modal" onDismiss={() => setPending(null)}>
                {pending && (
                    <Modal
                        title={`Remove ${pending.email}?`}
                        size="S"
                        onClose={() => setPending(null)}
                        closeLabel="Cancel"
                        actionButtons={[{ label: 'Remove', variant: 'negative', onPress: confirmRemoval }]}
                    >
                        <Text>
                            {pending.email} will no longer be {pending.what}. You can add them back at any time.
                        </Text>
                    </Modal>
                )}
            </DialogContainer>
        </PageLayout>
    );
}
