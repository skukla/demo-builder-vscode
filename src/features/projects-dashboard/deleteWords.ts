/**
 * The words a project delete's question uses in the batch window's Delete (`BatchDeleteQuestions`,
 * in the projects list's webview). Pure, so a webview bundle can import it (walk F96).
 *
 * @module features/projects-dashboard/deleteWords
 */

/**
 * The question's sentence: what goes whatever is ticked; for one project, the name its repository
 * and site have online, said once (walk F213), so its boxes need only say where each thing lives;
 * and, when the box is offered, that the datapack stays installed in Commerce unless the SC
 * uninstalls it. The box itself is `UNINSTALL_DATAPACK` (`data-installer/datapackWords.ts`).
 */
export function deleteSentence(offersData: boolean, onlineName?: string): string {
    const parts = ['Project files are removed from this machine.'];
    if (onlineName) parts.push(`You can also delete ${onlineName} online.`);
    if (offersData) parts.push('Datapacks stay installed in Commerce unless you uninstall them.');
    return parts.join(' ');
}
