/**
 * The Share dialog's words, in one place so the forms and their tests read the
 * same strings. House rules: short, plain, no middle dots.
 *
 * @module features/dashboard/ui/components/share/shareCopy
 */

export const SHARE_COPY = {
    title: 'Share Demo',
    how: 'How to Share',
    link: 'Send a Link',
    linkWhy: 'For colleagues with access to your repository. Includes later changes.',
    file: 'Send a File',
    fileWhy: 'For colleagues without access. A single zip file, with no later changes.',
    storefrontFailed: "Couldn't read the storefront.",
    linkHeadless: 'This project has no storefront of its own. Send a file instead.',
    copyLink: 'Copy Link',
    saveAndCopy: 'Save Details and Copy Link',
    copied: 'Copied',
    copyFailed: "Couldn't prepare the link.",
    welcome: 'Show on Welcome Step',
    changeDetails: 'Change Name or Description',
    name: 'Name',
    description: 'Description',
    checksTitle: 'Before Sharing',
    republishHint: 'Republish, then save again.',
    skippedTitle: 'Your details file was left alone.',
    remove: 'Remove the Details from My Repository',
    removedFile: 'The details are out of your repository',
    removedFileSkipped: "The details file in your repository isn't the one Demo Builder wrote, so it was left alone",
    removedCard: 'the card is off your Welcome step',
    removeFailed: "Couldn't remove the details.",
} as const;
