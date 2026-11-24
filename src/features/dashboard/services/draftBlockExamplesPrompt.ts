/**
 * The Draft Block Examples starter prompt (EDS-71 step 4c): seeded into the prompts list
 * (`defaultPromptsSeeder`) and sent by the dashboard's Draft Examples tile, one text for both.
 * The generated `draft-block-examples` skill carries what the agent does with it.
 *
 * Vscode-free: the dashboard webview imports it.
 *
 * @module features/dashboard/services/draftBlockExamplesPrompt
 */

import type { AiPrompt } from '@/types/base';

/**
 * The plan's text ended "and mark each page as a draft for me to check"; the flow has no draft
 * marker (the skill shows the user each page before `promote_block_to_library` writes it), so
 * the last sentence says what really happens.
 */
export const DRAFT_BLOCK_EXAMPLES_PROMPT: AiPrompt = {
    id: 'demo-builder-draft-block-examples',
    title: 'Draft Block Examples',
    prompt:
        'Write an example page for each block in this storefront that has none. Read each '
        + "block's code and description, and show me each page before you save it.",
    pinned: true,
};
