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
 * Laid out like the other collection screens (owner, 2026-10-07: the first cut
 * "does not follow the same design system"): `PageLayout` + `PageHeader`, the
 * two lists as `ViewSwitcher` tabs (the Data Installer's), a `SearchHeader` band
 * (count, filter, refresh) like Integrations and Your Projects, a row per
 * person with Remove in its ⋮ menu, and adding as the dashed row that opens a
 * dialog. `InlineNotice` for every notice, `LoadingDisplay` while something
 * runs, and the shared `Modal` to confirm a removal.
 *
 * @module features/eds/ui/siteAccess/SiteAccessScreen
 */

import { Button, DialogContainer, Flex, Text, TextField, View } from '@adobe/react-spectrum';
import React, { useEffect, useMemo, useState } from 'react';
import { AddPersonModal } from './AddPersonModal';
import { PeopleList } from './PeopleList';
import { SiteAccessNoticeView } from './SiteAccessNoticeView';
import { useSiteAccess, type ChangeType, type SiteTarget } from './useSiteAccess';
import { LoadingDisplay } from '@/core/ui/components/feedback/LoadingDisplay';
import { PageHeader } from '@/core/ui/components/layout/PageHeader';
import { PageLayout } from '@/core/ui/components/layout/PageLayout';
import { SearchHeader } from '@/core/ui/components/navigation/SearchHeader';
import { ViewSwitcher, type SwitchableView } from '@/core/ui/components/navigation/ViewSwitcher';
import { Modal } from '@/core/ui/components/ui/Modal';
import { matchesSearchFields } from '@/core/ui/hooks/useSearchFilter';
import type { SiteAccessInitialData, SiteAccessList, SiteAccessView } from '@/types/webviewPayloads';

export type SiteAccessScreenProps = Partial<SiteAccessInitialData>;

type ListId = 'admins' | 'readers';

/** What each tab says and sends. Admins need no typed target; readers carry it. */
const LISTS: Record<ListId, {
    label: string;
    addLabel: string;
    add: ChangeType;
    remove: Extract<ChangeType, 'removeSiteAdmin' | 'removeContentReader'>;
    what: string;
}> = {
    admins: {
        label: 'Site admins',
        addLabel: 'Add a site admin',
        add: 'addSiteAdmin',
        remove: 'removeSiteAdmin',
        what: 'a configuration admin',
    },
    readers: {
        label: 'Content readers',
        addLabel: 'Add a content reader',
        add: 'addContentReader',
        remove: 'removeContentReader',
        what: 'a content reader',
    },
};

const PERSON_SEARCH_FIELDS = ['email', 'role'] as const;

interface PendingRemoval {
    list: ListId;
    email: string;
}

/** The tabs the view has lists for, in order. */
function tabsFor(view: SiteAccessView | null): SwitchableView[] {
    const ids: ListId[] = ['admins', 'readers'];
    return ids.filter((id) => view?.[id]).map((id) => ({ id, label: LISTS[id].label }));
}

/** "2 people on acme/shop". */
function countLine(list: SiteAccessList): string {
    const n = list.people.length;
    return `${n} ${n === 1 ? 'person' : 'people'} on ${list.site}`;
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
        <Flex gap="size-100" alignItems="end" wrap marginBottom="size-200">
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
    const [chosenTab, setChosenTab] = useState<ListId>('admins');
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const [pending, setPending] = useState<PendingRemoval | null>(null);

    useEffect(() => {
        if (hasStorefront) void load();
    }, [hasStorefront, load]);

    const tabs = tabsFor(view);
    // The chosen tab, or the first list the view has when that one is absent.
    const tab: ListId = view?.[chosenTab] ? chosenTab : ((tabs[0]?.id as ListId) ?? chosenTab);
    const list = view?.[tab];
    const copy = LISTS[tab];
    const people = useMemo(
        () => (list?.people ?? []).filter((person) => matchesSearchFields(person, PERSON_SEARCH_FIELDS, query)),
        [list, query],
    );
    const isFiltering = query.trim().length > 0;
    const isBusy = busy !== null;
    const noticeActions = { isBusy, onOpenLink: openLink, onWait: () => void waitForAccess(), onRepair: repair };

    const showSite = (typed: SiteTarget): void => {
        setTarget(typed);
        void load(typed);
    };
    const selectTab = (id: string): void => {
        setChosenTab(id as ListId);
        setQuery('');
    };
    const addPerson = (email: string): void => {
        setAdding(false);
        void change(copy.add, email, tab === 'readers' ? target : undefined);
    };
    const confirmRemoval = (): void => {
        if (!pending) return;
        setPending(null);
        void change(LISTS[pending.list].remove, pending.email, pending.list === 'readers' ? target : undefined);
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
                {!hasStorefront && <SiteTargetForm isBusy={isBusy} onShow={showSite} />}
                <ViewSwitcher views={tabs} activeId={tab} onSelect={selectTab} />
                {notice && (
                    <View marginBottom="size-200">
                        <SiteAccessNoticeView notice={notice} {...noticeActions} />
                    </View>
                )}
                {busy && <LoadingDisplay message={busy} subMessage={progress ?? undefined} />}
                {!busy && list && (
                    <>
                        <SearchHeader
                            searchQuery={query}
                            onSearchQueryChange={setQuery}
                            searchPlaceholder="Filter people"
                            searchThreshold={0}
                            totalCount={list.people.length}
                            filteredCount={people.length}
                            itemNoun="person"
                            itemNounPlural="people"
                            countText={countLine(list)}
                            onRefresh={() => void load(target)}
                            refreshAriaLabel="Refresh site access"
                            hasLoadedOnce
                            alwaysShowCount
                        />
                        {list.notice && (
                            <View marginBottom="size-200">
                                <SiteAccessNoticeView notice={list.notice} {...noticeActions} />
                            </View>
                        )}
                        {list.people.length === 0 && !list.canManage ? (
                            <Text UNSAFE_className="text-gray-600">Nobody has access yet.</Text>
                        ) : (
                            <PeopleList
                                people={people}
                                canManage={list.canManage}
                                addLabel={isFiltering ? undefined : copy.addLabel}
                                onAdd={() => setAdding(true)}
                                onRemove={(email) => setPending({ list: tab, email })}
                            />
                        )}
                    </>
                )}
            </div>
            <AddPersonModal
                isOpen={adding}
                title={copy.addLabel}
                onAdd={addPerson}
                onClose={() => setAdding(false)}
            />
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
                            {pending.email} will no longer be {LISTS[pending.list].what}. You can add them back at
                            any time.
                        </Text>
                    </Modal>
                )}
            </DialogContainer>
        </PageLayout>
    );
}
