/**
 * The Share dialog's words, in one place so the forms and their tests read the
 * same strings. House rules: short, plain, no middle dots.
 *
 * @module features/dashboard/ui/components/share/shareCopy
 */

export const SHARE_COPY = {
    title: 'Share Demo',
    how: 'How to Share',
    next: 'Next',
    back: 'Back',
    link: 'Send a Link',
    linkWhy: 'For colleagues with access to your repository. Includes later changes.',
    file: 'Send a File',
    fileWhy: 'For colleagues without access. A single zip file, with no later changes.',
    storefrontFailed: "Couldn't read the storefront.",
    linkHeadless: 'This project has no storefront of its own. Send a file instead.',
    repository: 'Repository',
    copyLink: 'Copy Link',
    saveAndCopy: 'Save and Copy Link',
    copied: 'Copied',
    copyFailed: "Couldn't prepare the link.",
    name: 'Name',
    description: 'Description',
    republishHint: 'Republish, then save again.',
    shareDatapack: 'Share Datapack',
    datapackShared: 'Datapack Shared',
    skippedTitle: 'Your details file was left alone.',
} as const;
