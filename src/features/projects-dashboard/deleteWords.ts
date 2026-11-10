/**
 * The words a project delete's question shares between its two windows: the single delete's
 * (`deletionConfirmation.ts`, in the extension) and Delete Selected's (`BatchDeleteQuestions`, in
 * the projects list's webview). Pure, so both bundles can import it (walk F96).
 *
 * @module features/projects-dashboard/deleteWords
 */

/**
 * The question's sentence: what goes whatever is ticked, and, when the box is offered, that the
 * datapack stays installed in Commerce unless the SC uninstalls it. The box itself is
 * `UNINSTALL_DATAPACK` (`data-installer/datapackWords.ts`).
 */
export function deleteSentence(offersData: boolean): string {
    const files = 'Project files are removed from this machine.';
    return offersData ? `${files} Datapacks stay installed in Commerce unless you uninstall them.` : files;
}
