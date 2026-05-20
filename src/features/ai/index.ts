/**
 * AI Feature — Public API
 *
 * Exports the public surface for the AI interaction layer:
 * - AI context file verification (aiSetupVerifier)
 *
 * Internal imports should use this barrel rather than the individual
 * module paths to respect feature boundaries.
 */

export { verifyAiSetup } from './aiSetupVerifier';
export type { AiCheckResult, AiVerificationResult } from './aiSetupVerifier';
