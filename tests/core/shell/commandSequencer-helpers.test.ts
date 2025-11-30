/**
 * Tests for commandSequencer helper functions (SOP §3 compliance)
 */
import { getNumericErrorCode } from '@/core/shell/commandSequencer';

describe('getNumericErrorCode', () => {
    it('returns 1 when no code', () => {
        expect(getNumericErrorCode({} as NodeJS.ErrnoException)).toBe(1);
    });

    it('returns numeric code directly', () => {
        expect(getNumericErrorCode({ code: 127 } as unknown as NodeJS.ErrnoException)).toBe(127);
    });

    it('returns 1 for string codes', () => {
        expect(getNumericErrorCode({ code: 'ENOENT' } as NodeJS.ErrnoException)).toBe(1);
    });

    it('returns 1 for undefined code', () => {
        expect(getNumericErrorCode({ code: undefined } as unknown as NodeJS.ErrnoException)).toBe(1);
    });

    it('returns 0 for exit code 0', () => {
        expect(getNumericErrorCode({ code: 0 } as unknown as NodeJS.ErrnoException)).toBe(0);
    });
});
