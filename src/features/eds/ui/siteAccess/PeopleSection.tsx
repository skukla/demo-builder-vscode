/**
 * One of the Site access lists — who administers the site, or who reads its
 * content — with Remove on each removable row and an Add field when this
 * identity can change it.
 *
 * @module features/eds/ui/siteAccess/PeopleSection
 */

import { Button, Flex, Text, TextField } from '@adobe/react-spectrum';
import React, { useState } from 'react';
import { SiteAccessNoticeView } from './SiteAccessNoticeView';
import { ConfigSection } from '@/core/ui/components/forms/ConfigSection';
import type { SiteAccessLink, SiteAccessList } from '@/types/webviewPayloads';

export interface PeopleSectionProps {
    id: string;
    label: string;
    list: SiteAccessList;
    /** Empty-list sentence: "No site admins yet." */
    emptyText: string;
    addLabel: string;
    isBusy: boolean;
    showDivider?: boolean;
    /** Resolves true when the add landed, so the field clears only then. */
    onAdd: (email: string) => Promise<boolean>;
    onRemove: (email: string) => void;
    onOpenLink: (id: SiteAccessLink['id']) => void;
    onWait: () => void;
    onRepair: () => void;
}

export function PeopleSection({
    id,
    label,
    list,
    emptyText,
    addLabel,
    isBusy,
    showDivider,
    onAdd,
    onRemove,
    onOpenLink,
    onWait,
    onRepair,
}: PeopleSectionProps): React.ReactElement {
    const [email, setEmail] = useState('');
    const add = async (): Promise<void> => {
        if (await onAdd(email.trim())) setEmail('');
    };

    return (
        <ConfigSection id={id} label={label} showDivider={showDivider}>
            {list.notice && (
                <SiteAccessNoticeView
                    notice={list.notice}
                    isBusy={isBusy}
                    onOpenLink={onOpenLink}
                    onWait={onWait}
                    onRepair={onRepair}
                />
            )}
            {list.people.length === 0 ? (
                <Text UNSAFE_className="text-gray-600">{emptyText}</Text>
            ) : (
                <ul className="site-access-people" aria-label={label}>
                    {list.people.map((person) => (
                        <li key={person.email} className="site-access-person">
                            <Flex direction="column" flex={1}>
                                <Text>{person.email}</Text>
                                <Text UNSAFE_className="text-gray-600">{person.role}</Text>
                            </Flex>
                            {person.removable && list.canManage && (
                                <Button
                                    variant="secondary"
                                    isDisabled={isBusy}
                                    onPress={() => onRemove(person.email)}
                                    aria-label={`Remove ${person.email}`}
                                >
                                    Remove
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {list.canManage && (
                <Flex gap="size-100" alignItems="end">
                    <TextField
                        label={addLabel}
                        type="email"
                        value={email}
                        onChange={setEmail}
                        isDisabled={isBusy}
                        width="size-4600"
                    />
                    <Button variant="accent" isDisabled={isBusy || email.trim() === ''} onPress={() => void add()}>
                        Add
                    </Button>
                </Flex>
            )}
        </ConfigSection>
    );
}
