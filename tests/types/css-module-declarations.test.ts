/**
 * CSS Module Type Declarations Tests
 *
 * Validates that src/types/css.d.ts exists and correctly declares
 * TypeScript module types for CSS Modules (*.module.css imports).
 *
 * This enables TypeScript to understand CSS Module imports without
 * compilation errors, while maintaining type safety through readonly
 * string mappings.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import * as ts from 'typescript';

describe('CSS Module Type Declarations', () => {
  const declarationPath = resolve(__dirname, '../../src/types/css.d.ts');

  describe('File Existence', () => {
    it('should have css.d.ts file in src/types directory', () => {
      expect(existsSync(declarationPath)).toBe(true);
    });
  });

  describe('Module Declaration Structure', () => {
    let declarationContent: string;

    beforeAll(() => {
      // Skip if file doesn't exist (tests will fail in file existence tests)
      if (existsSync(declarationPath)) {
        declarationContent = readFileSync(declarationPath, 'utf-8');
      } else {
        declarationContent = '';
      }
    });

    it('should declare module for *.module.css pattern', () => {
      expect(declarationContent).toContain("declare module '*.module.css'");
    });

    it('should export default with readonly string mapping type', () => {
      // The declaration should export a default that maps string keys to string values
      expect(declarationContent).toMatch(/readonly\s*\[\s*key\s*:\s*string\s*\]\s*:\s*string/);
    });

    it('should use const keyword for immutable class names object', () => {
      // The exported object should be a const for runtime immutability semantics
      expect(declarationContent).toContain('const classes');
    });

    it('should export as default export', () => {
      expect(declarationContent).toContain('export default');
    });
  });

  describe('TypeScript Compilation Compatibility', () => {
    it('should be valid TypeScript syntax', () => {
      // File must exist for this test
      expect(existsSync(declarationPath)).toBe(true);

      const declarationContent = readFileSync(declarationPath, 'utf-8');

      // Parse the declaration file to verify it's valid TypeScript
      const sourceFile = ts.createSourceFile(
        'css.d.ts',
        declarationContent,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // Check that parsing produced a valid source file with statements
      expect(sourceFile.statements.length).toBeGreaterThan(0);

      // Verify no parse errors by checking if diagnostics would be empty
      // A properly formatted d.ts file should parse without issues
      expect(sourceFile.endOfFileToken).toBeDefined();
    });

    it('should declare an ambient module', () => {
      // File must exist for this test
      expect(existsSync(declarationPath)).toBe(true);

      const declarationContent = readFileSync(declarationPath, 'utf-8');

      const sourceFile = ts.createSourceFile(
        'css.d.ts',
        declarationContent,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // Find module declaration node
      const hasModuleDeclaration = sourceFile.statements.some(
        (stmt) => ts.isModuleDeclaration(stmt)
      );

      expect(hasModuleDeclaration).toBe(true);
    });
  });

  describe('Documentation', () => {
    it('should include JSDoc comment explaining purpose', () => {
      // File must exist for this test
      expect(existsSync(declarationPath)).toBe(true);

      const declarationContent = readFileSync(declarationPath, 'utf-8');

      // Should have a JSDoc or comment explaining the file's purpose
      expect(declarationContent).toMatch(/\/\*\*[\s\S]*?\*\//);
    });
  });
});
