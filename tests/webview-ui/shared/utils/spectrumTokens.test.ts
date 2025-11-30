import { translateSpectrumToken, DimensionValue, SpectrumSizeToken } from '@/core/ui/utils/spectrumTokens';

describe('translateSpectrumToken', () => {
  describe('Happy Path - Spectrum Tokens', () => {
    it('should translate size-100 to 8px', () => {
      expect(translateSpectrumToken('size-100')).toBe('8px');
    });

    it('should translate size-200 to 16px', () => {
      expect(translateSpectrumToken('size-200')).toBe('16px');
    });

    it('should translate size-300 to 24px', () => {
      expect(translateSpectrumToken('size-300')).toBe('24px');
    });

    it('should translate all 13 tokens correctly', () => {
      // Test all tokens from smallest to largest
      expect(translateSpectrumToken('size-50')).toBe('4px');
      expect(translateSpectrumToken('size-100')).toBe('8px');
      expect(translateSpectrumToken('size-115')).toBe('9.2px');
      expect(translateSpectrumToken('size-130')).toBe('10.4px');
      expect(translateSpectrumToken('size-150')).toBe('12px');
      expect(translateSpectrumToken('size-160')).toBe('12.8px');
      expect(translateSpectrumToken('size-200')).toBe('16px');
      expect(translateSpectrumToken('size-300')).toBe('24px');
      expect(translateSpectrumToken('size-400')).toBe('32px');
      expect(translateSpectrumToken('size-500')).toBe('40px');
      expect(translateSpectrumToken('size-600')).toBe('48px');
      expect(translateSpectrumToken('size-1000')).toBe('80px');
      expect(translateSpectrumToken('size-6000')).toBe('480px');
    });
  });

  describe('Happy Path - Numeric Values', () => {
    it('should convert number 24 to "24px"', () => {
      expect(translateSpectrumToken(24)).toBe('24px');
    });

    it('should convert number 0 to "0px"', () => {
      expect(translateSpectrumToken(0)).toBe('0px');
    });

    it('should convert decimal 16.5 to "16.5px"', () => {
      expect(translateSpectrumToken(16.5)).toBe('16.5px');
    });

    it('should convert various numeric values correctly', () => {
      expect(translateSpectrumToken(100)).toBe('100px');
      expect(translateSpectrumToken(1)).toBe('1px');
      expect(translateSpectrumToken(999.99)).toBe('999.99px');
    });
  });

  describe('Happy Path - Pixel Strings', () => {
    it('should pass through "24px" unchanged', () => {
      expect(translateSpectrumToken('24px')).toBe('24px');
    });

    it('should pass through "100px" unchanged', () => {
      expect(translateSpectrumToken('100px')).toBe('100px');
    });

    it('should pass through various pixel strings unchanged', () => {
      expect(translateSpectrumToken('0px')).toBe('0px');
      expect(translateSpectrumToken('16.5px')).toBe('16.5px');
      expect(translateSpectrumToken('800px')).toBe('800px');
    });
  });

  describe('Edge Cases', () => {
    it('should handle smallest token size-50', () => {
      expect(translateSpectrumToken('size-50')).toBe('4px');
    });

    it('should handle largest token size-6000', () => {
      expect(translateSpectrumToken('size-6000')).toBe('480px');
    });

    it('should handle undefined', () => {
      expect(translateSpectrumToken(undefined)).toBeUndefined();
    });

    it('should handle zero values', () => {
      expect(translateSpectrumToken(0)).toBe('0px');
    });

    it('should handle decimal pixel values', () => {
      expect(translateSpectrumToken(16.5)).toBe('16.5px');
    });
  });

  describe('Error Conditions', () => {
    it('should return input unchanged for invalid token', () => {
      // Type assertion needed to test runtime behavior (TypeScript correctly rejects at compile-time)
      expect(translateSpectrumToken('size-999' as any)).toBe('size-999');
    });

    it('should return input unchanged for non-token strings', () => {
      // Type assertion needed to test runtime behavior (TypeScript correctly rejects at compile-time)
      expect(translateSpectrumToken('invalid' as any)).toBe('invalid');
    });

    it('should gracefully handle various invalid inputs', () => {
      // Type assertions needed to test runtime behavior for graceful degradation
      expect(translateSpectrumToken('abc' as any)).toBe('abc');
      expect(translateSpectrumToken('size-' as any)).toBe('size-');
      expect(translateSpectrumToken('' as any)).toBe('');
    });
  });
});

describe('DimensionValue Type', () => {
  it('should accept valid Spectrum tokens', () => {
    const gap: DimensionValue = 'size-300';
    expect(gap).toBe('size-300');
  });

  it('should accept number values', () => {
    const gap: DimensionValue = 24;
    expect(gap).toBe(24);
  });

  it('should accept pixel strings', () => {
    const gap: DimensionValue = '24px';
    expect(gap).toBe('24px');
  });

  it('should work with all token types', () => {
    const tokens: DimensionValue[] = [
      'size-50',
      'size-100',
      'size-200',
      'size-300',
      24,
      '100px'
    ];

    tokens.forEach(token => {
      expect(translateSpectrumToken(token)).toBeTruthy();
    });
  });

  // Commented example showing compile-time safety:
  // const invalid: DimensionValue = 'size-999'; // TypeScript error expected
});

describe('SpectrumSizeToken Type', () => {
  it('should include all 13 expected tokens', () => {
    const allTokens: SpectrumSizeToken[] = [
      'size-50',
      'size-100',
      'size-115',
      'size-130',
      'size-150',
      'size-160',
      'size-200',
      'size-300',
      'size-400',
      'size-500',
      'size-600',
      'size-1000',
      'size-6000'
    ];

    // Verify each token can be translated
    allTokens.forEach(token => {
      const result = translateSpectrumToken(token);
      expect(result).toMatch(/^\d+(\.\d+)?px$/);
    });
  });
});
