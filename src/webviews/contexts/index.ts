/**
 * React Context Providers
 *
 * This file exports all context providers and their hooks.
 *
 * Import contexts using the @ alias:
 * import { useVSCode, useTheme } from '@/contexts';
 */

export { VSCodeProvider, useVSCode } from './VSCodeContext';
export type { VSCodeProviderProps } from './VSCodeContext';

export { ThemeProvider, useTheme } from './ThemeContext';
export type { ThemeProviderProps, Theme } from './ThemeContext';

export { WizardProvider, useWizard } from './WizardContext';
export type { WizardProviderProps, WizardStep } from './WizardContext';
