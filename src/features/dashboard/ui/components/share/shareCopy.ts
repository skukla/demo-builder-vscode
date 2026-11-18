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
    welcome: 'Add to My Welcome Step',
    welcomeWhy: 'So you can start new projects from it.',
    name: 'Name',
    description: 'Description',
    republishHint: 'Republish, then save again.',
    shareDatapack: 'Share Datapack',
    datapackShared: 'Datapack Shared',
    skippedTitle: 'Your details file was left alone.',
    remove: 'Remove the Details from My Repository',
    removedFile: 'The details are out of your repository',
    removedFileSkipped: "The details file in your repository isn't the one Demo Builder wrote, so it was left alone",
    removedCard: 'the card is off your Welcome step',
    removeFailed: "Couldn't remove the details.",
} as const;
