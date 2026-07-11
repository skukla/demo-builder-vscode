/**
 * InlineRenameField — rename-in-place for a displayed name.
 *
 * SHARED by the projects-list card and the project dashboard title (two
 * consumers → core placement, like ApiAccessPicker). Display mode renders the
 * name (caller-supplied typography class) plus a hover/focus-revealed quiet
 * pencil; clicking the pencil swaps in a prefilled, focused, selected input.
 *
 * Enter and blur COMMIT through the async `onRename` (resolve null = success →
 * back to display mode, the parent's refreshed state supplies the new name;
 * resolve a string = error → stay in edit mode and show it inline). Escape
 * cancels. A trimmed-empty or unchanged value exits silently — no request.
 * While a rename is in flight the input is disabled.
 *
 * Containment: in display mode only the PENCIL stops click/keydown
 * propagation (the name text stays click-transparent so a hosting
 * click-to-open card still opens on a name click); in edit mode the whole
 * editor is contained — typing or committing must never open the project.
 *
 * @module core/ui/components/forms/InlineRenameField
 */

import { ActionButton } from '@adobe/react-spectrum';
import Edit from '@spectrum-icons/workflow/Edit';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/core/ui/utils/classNames';

export interface InlineRenameFieldProps {
    /** The committed name (display mode). */
    name: string;
    /** Commit: resolve null on success, or an error message to show inline. */
    onRename: (newName: string) => Promise<string | null>;
    /** Hide the affordance entirely (e.g. demo running — backend rejects anyway). */
    disabled?: boolean;
    /** Class applied to the display-mode text (caller owns typography). */
    textClassName?: string;
}

/**
 * The rename-in-place field.
 *
 * @param props - name, async commit, disabled gate, typography class, pencil label
 * @returns the display text + pencil, or the inline editor
 */
export function InlineRenameField({
    name,
    onRename,
    disabled = false,
    textClassName,
}: InlineRenameFieldProps): React.ReactElement {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>(undefined);
    const inputRef = useRef<HTMLInputElement>(null);
    // Mirrors `busy` for event handlers (a disable-triggered blur must not
    // re-commit while the first commit is still in flight).
    const busyRef = useRef(false);

    useEffect(() => {
        if (!editing) return;
        inputRef.current?.focus();
        inputRef.current?.select();
    }, [editing]);

    // Refocus AFTER the re-enabling render of a failed commit: browsers drop
    // focus when the focused input is disabled mid-flight, and focus() on a
    // still-disabled input is ignored — so this must run post-render.
    useEffect(() => {
        if (editing && !busy && error) inputRef.current?.focus();
    }, [editing, busy, error]);

    const startEditing = useCallback((): void => {
        setValue(name);
        setError(undefined);
        setEditing(true);
    }, [name]);

    const exitEdit = useCallback((): void => {
        setEditing(false);
        setError(undefined);
    }, []);

    const commit = useCallback(async (): Promise<void> => {
        if (busyRef.current) return;
        const trimmed = value.trim();
        if (!trimmed || trimmed === name) {
            exitEdit();
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError(undefined);
        // A rejecting onRename must not wedge the field (shared contract:
        // consumers SHOULD resolve an error string, but a throw degrades to one).
        let result: string | null;
        try {
            result = await onRename(trimmed);
        } catch {
            result = 'Rename failed';
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
        if (result === null) {
            exitEdit();
        } else {
            setError(result);
        }
    }, [value, name, onRename, exitEdit]);

    // Contain the editor: the hosting card tile opens on click/Enter/Space.
    const stopPropagation = useCallback(
        (event: React.SyntheticEvent): void => event.stopPropagation(),
        [],
    );

    if (!editing) {
        // Containment covers ONLY the pencil: the display-mode name stays
        // click-transparent so a hosting click-to-open card still opens on a
        // name click. Edit mode (below) contains the whole editor.
        return (
            <span className="inline-rename">
                <span className={cn('inline-rename-text', textClassName)}>{name}</span>
                {!disabled && (
                    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child ActionButton
                    <span onClick={stopPropagation} onKeyDown={stopPropagation}>
                        <ActionButton
                            isQuiet
                            aria-label={`Rename ${name}`}
                            UNSAFE_className="inline-rename-pencil"
                            onPress={startEditing}
                        >
                            <Edit size="S" />
                        </ActionButton>
                    </span>
                )}
            </span>
        );
    }

    return (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- containment only; interaction lives on the child input
        <span
            className="inline-rename inline-rename--editing"
            onClick={stopPropagation}
            onKeyDown={stopPropagation}
        >
            <input
                ref={inputRef}
                className="inline-rename-input"
                aria-label="New project name"
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') void commit();
                    if (event.key === 'Escape') exitEdit();
                }}
                onBlur={() => {
                    if (!busyRef.current) void commit();
                }}
            />
            {error && (
                <span className="inline-rename-error" role="alert">
                    {error}
                </span>
            )}
        </span>
    );
}
