/**
 * The Share dialog's words, in one place so the forms and their tests read the
 * same strings. House rules: short, plain, no middle dots.
 *
 * @module features/dashboard/ui/components/share/shareCopy
 */

export const SHARE_COPY = {
    title: 'Share Demo',
    how: 'How to share',
    link: 'Send a link',
    linkWhy: 'For colleagues who can open your GitHub. They paste it into "Add a demo package" and get your later changes.',
    file: 'Send a file',
    fileWhy: "For colleagues who can't. One zip, no later changes.",
    looking: 'Checking the storefront',
    lookingFor: 'Reading the repository and the published pages.',
    storefront: 'Storefront',
    linkHeadless: 'This project has no storefront of its own. Send a file instead.',
    copyLink: 'Copy link',
    saveAndCopy: 'Save details and copy link',
    copied: 'Copied',
    saving: 'Saving',
    copyFailed: "Couldn't prepare the link",
    welcome: 'Also show it on my Welcome step',
    changeDetails: 'Change name or description',
    name: 'Name',
    description: 'Description',
    checksTitle: 'Before you send it',
    republishHint: 'Republish, then save again.',
    skippedTitle: 'Your details file was left alone',
    remove: 'Remove the details from my repository',
    removing: 'Removing',
    removedTitle: 'Removed',
    removedFile: 'The details are out of your repository',
    removedFileSkipped: "The details file in your repository isn't the one Demo Builder wrote, so it was left alone",
    removedCard: 'the card is off your Welcome step',
    removeFailed: "Couldn't remove the details",
} as const;
