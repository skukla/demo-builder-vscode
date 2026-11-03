/**
 * The create half of the Adobe project and workspace fields (`AdobeEntityFields`): its panel and
 * the "New" button that opens it. Split out when that file passed its size limit.
 *
 * @module features/authentication/ui/components/NewAdobeEntityForm
 */

import { Button, Flex, Heading, Text, TextField, View } from '@adobe/react-spectrum';
import Add from '@spectrum-icons/workflow/Add';
import React, { useState } from 'react';
import { LoadingOverlay } from '@/core/ui/components/feedback/LoadingOverlay';

/**
 * The CREATE panel — a gray-50 card with a name field + Browse/Create footer, matching
 * the extension's "Create New Repository" form. Presentational: the parent injects the
 * actual create call, the busy/error state, and the "Browse" (back-to-list) handler.
 *
 * @param props - the title noun, a context hint, busy/error state, and the callbacks
 * @returns the create panel
 */
export function NewAdobeEntityForm({
    noun,
    contextHint,
    busy,
    error,
    initialName,
    onBrowse,
    onCreate,
}: {
    noun: 'Project' | 'Workspace';
    contextHint?: string;
    busy: boolean;
    error?: string;
    /** Prefill for the name field (e.g. re-opening after an external create failure). */
    initialName?: string;
    onBrowse: () => void;
    onCreate: (name: string) => void;
}): React.ReactElement {
    const [name, setName] = useState(initialName ?? '');
    const trimmed = name.trim();

    return (
        <View
            backgroundColor="gray-50"
            borderRadius="medium"
            padding="size-300"
            position="relative"
        >
            <Heading level={3} margin={0} marginBottom="size-200">{`Create New ${noun}`}</Heading>

            <TextField
                label={`${noun} Name`}
                value={name}
                onChange={setName}
                description={contextHint}
                validationState={error ? 'invalid' : undefined}
                errorMessage={error}
                width="100%"
                isRequired
                autoFocus
                isDisabled={busy}
            />

            <Flex justifyContent="end" gap="size-100" marginTop="size-200">
                <Button variant="secondary" isDisabled={busy} onPress={onBrowse}>
                    Browse
                </Button>
                <Button
                    variant="accent"
                    isDisabled={!trimmed || busy}
                    onPress={() => onCreate(trimmed)}
                >
                    Create
                </Button>
            </Flex>

            <LoadingOverlay isVisible={busy} />
        </View>
    );
}

/** The "New" header button shown in browse mode (Flow A only). */
export function NewButton({ onPress }: { onPress: () => void }): React.ReactElement {
    return (
        <Button variant="accent" onPress={onPress}>
            <Add size="S" />
            <Text>New</Text>
        </Button>
    );
}
