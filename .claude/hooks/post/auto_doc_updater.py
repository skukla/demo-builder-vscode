#!/usr/bin/env python3
"""
Auto Documentation Updater Hook - PostToolUse
Automatically checks and updates documentation when code changes
"""

import json
import sys
import re
import subprocess
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager


class DocumentationChecker:
    """Checks documentation consistency with code"""
    
    def __init__(self):
        self.project_root = Path.cwd()
        self.doc_map = self._build_documentation_map()
        
    def _build_documentation_map(self) -> Dict[str, str]:
        """Build a map of code files to their documentation"""
        return {
            "src/extension.ts": "CLAUDE.md",
            "src/commands/": "src/commands/CLAUDE.md",
            "src/webviews/": "src/webviews/CLAUDE.md",
            "src/utils/": "src/utils/CLAUDE.md",
            "templates/": "templates/CLAUDE.md",
            "src/webviews/components/wizard/WizardContainer.tsx": "docs/troubleshooting.md",
            "src/webviews/components/steps/PrerequisitesStep.tsx": "docs/systems/prerequisites-system.md",
        }
    
    def find_related_docs(self, file_path: str) -> List[str]:
        """Find documentation files related to a code file"""
        related_docs = []
        
        # Check direct mappings
        for pattern, doc in self.doc_map.items():
            if pattern in file_path:
                doc_path = self.project_root / doc
                if doc_path.exists():
                    related_docs.append(str(doc_path))
        
        # Check for CLAUDE.md in parent directories
        file_path_obj = Path(file_path)
        for parent in file_path_obj.parents:
            claude_md = parent / "CLAUDE.md"
            if claude_md.exists() and claude_md.is_relative_to(self.project_root):
                related_docs.append(str(claude_md))
                break
        
        return list(set(related_docs))
    
    def check_code_references(self, doc_path: str, code_file: str) -> List[Dict[str, Any]]:
        """Check if code references in documentation are still valid"""
        issues = []
        
        try:
            with open(doc_path, 'r') as f:
                doc_content = f.read()
            
            # Find code references (function names, class names, file paths)
            patterns = [
                # Function/method references: functionName() or Class.method()
                (r'`(\w+(?:\.\w+)?)\(\)`', 'function'),
                # Class/interface references: ClassName or InterfaceName
                (r'`([A-Z]\w+)`', 'class'),
                # File path references: src/file.ts or ./relative/path
                (r'`([\.\/]?(?:src|templates|docs|test)[\/\w\-\.]+)`', 'path'),
                # Import statements in code blocks
                (r'(?:import|from)\s+[\'"]([\.\/\w\-]+)[\'"]', 'import'),
            ]
            
            for pattern, ref_type in patterns:
                for match in re.finditer(pattern, doc_content):
                    reference = match.group(1)
                    
                    if ref_type == 'path':
                        # Check if file exists
                        ref_path = self.project_root / reference
                        if not ref_path.exists():
                            issues.append({
                                'type': 'broken_path',
                                'reference': reference,
                                'doc_file': doc_path,
                                'line': doc_content[:match.start()].count('\n') + 1
                            })
                    
                    elif ref_type in ['function', 'class']:
                        # Check if reference exists in the code file
                        if code_file and Path(code_file).exists():
                            with open(code_file, 'r') as f:
                                code_content = f.read()
                            
                            # Simple check - look for the reference in code
                            if reference not in code_content:
                                issues.append({
                                    'type': f'missing_{ref_type}',
                                    'reference': reference,
                                    'doc_file': doc_path,
                                    'code_file': code_file,
                                    'line': doc_content[:match.start()].count('\n') + 1
                                })
        
        except Exception as e:
            # Silent fail - don't block on documentation checks
            pass
        
        return issues
    
    def check_code_examples(self, doc_path: str) -> List[Dict[str, Any]]:
        """Check if code examples in documentation are valid"""
        issues = []
        
        try:
            with open(doc_path, 'r') as f:
                doc_content = f.read()
            
            # Find code blocks
            code_block_pattern = r'```(?:typescript|javascript|ts|js|tsx|jsx)\n(.*?)\n```'
            
            for match in re.finditer(code_block_pattern, doc_content, re.DOTALL):
                code_example = match.group(1)
                line_num = doc_content[:match.start()].count('\n') + 1
                
                # Check for common issues
                # 1. Old API patterns (like Flex component issue we fixed)
                if '<Flex height="100%">' in code_example:
                    issues.append({
                        'type': 'outdated_pattern',
                        'description': 'Uses Flex component with height="100%" (known width issue)',
                        'doc_file': doc_path,
                        'line': line_num,
                        'suggestion': 'Use <div style={{ display: "flex", height: "100%", width: "100%" }}>'
                    })
                
                # 2. Import paths that might be wrong
                import_pattern = r'import .* from [\'"]([\.\/\w\-]+)[\'"]'
                for import_match in re.finditer(import_pattern, code_example):
                    import_path = import_match.group(1)
                    if import_path.startswith('.'):
                        # Relative import - harder to verify without context
                        pass
                    else:
                        # Package import - check if it's in package.json
                        package_json = self.project_root / 'package.json'
                        if package_json.exists():
                            with open(package_json, 'r') as f:
                                package_data = json.load(f)
                            
                            all_deps = {**package_data.get('dependencies', {}), 
                                      **package_data.get('devDependencies', {})}
                            
                            if import_path not in all_deps and not import_path.startswith('@'):
                                issues.append({
                                    'type': 'unknown_import',
                                    'import': import_path,
                                    'doc_file': doc_path,
                                    'line': line_num
                                })
        
        except Exception as e:
            # Silent fail
            pass
        
        return issues
    
    def suggest_documentation_updates(self, code_file: str, changes: str) -> Optional[str]:
        """Suggest documentation updates based on code changes"""
        suggestions = []
        
        # Analyze the changes
        if 'function' in changes or 'const' in changes:
            # New function added
            func_pattern = r'(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*='
            for match in re.finditer(func_pattern, changes):
                func_name = match.group(1) or match.group(2)
                suggestions.append(f"Document new function: {func_name}")
        
        if 'interface' in changes or 'type' in changes:
            # New type/interface added
            type_pattern = r'(?:export\s+)?(?:interface|type)\s+(\w+)'
            for match in re.finditer(type_pattern, changes):
                type_name = match.group(1)
                suggestions.append(f"Document new type: {type_name}")
        
        if 'class' in changes:
            # New class added
            class_pattern = r'(?:export\s+)?class\s+(\w+)'
            for match in re.finditer(class_pattern, changes):
                class_name = match.group(1)
                suggestions.append(f"Document new class: {class_name}")
        
        return "\n".join(suggestions) if suggestions else None


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Only process file modifications
        tool_name = hook_input.get("tool_name", "")
        if tool_name not in ["Write", "Edit", "MultiEdit"]:
            print(json.dumps({"decision": "approve"}))
            return
        
        # Get file details
        tool_input = hook_input.get("tool_input", {})
        file_path = tool_input.get("file_path", "")
        
        # Skip if not a code file
        code_extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java']
        if not any(file_path.endswith(ext) for ext in code_extensions):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize documentation checker
        doc_checker = DocumentationChecker()
        
        # Find related documentation
        related_docs = doc_checker.find_related_docs(file_path)
        
        if not related_docs:
            print(json.dumps({"decision": "approve"}))
            return
        
        # Check documentation consistency
        all_issues = []
        for doc in related_docs:
            # Check code references
            ref_issues = doc_checker.check_code_references(doc, file_path)
            all_issues.extend(ref_issues)
            
            # Check code examples
            example_issues = doc_checker.check_code_examples(doc)
            all_issues.extend(example_issues)
        
        # Get change content for suggestions
        change_content = tool_input.get("new_string", "") or tool_input.get("content", "")
        suggestions = doc_checker.suggest_documentation_updates(file_path, change_content)
        
        # If issues found or suggestions available, create a message
        if all_issues or suggestions:
            message_parts = [f"📝 Documentation may need updating after modifying {Path(file_path).name}"]
            
            if all_issues:
                message_parts.append("\n⚠️ Documentation Issues Found:")
                for issue in all_issues[:5]:  # Show first 5 issues
                    if issue['type'] == 'broken_path':
                        message_parts.append(f"  - Broken path reference: {issue['reference']} in {Path(issue['doc_file']).name}:{issue['line']}")
                    elif issue['type'] == 'missing_function':
                        message_parts.append(f"  - Missing function: {issue['reference']} referenced in {Path(issue['doc_file']).name}")
                    elif issue['type'] == 'outdated_pattern':
                        message_parts.append(f"  - Outdated pattern in {Path(issue['doc_file']).name}:{issue['line']}")
                        message_parts.append(f"    Suggestion: {issue['suggestion']}")
                
                if len(all_issues) > 5:
                    message_parts.append(f"  ... and {len(all_issues) - 5} more issues")
            
            if suggestions:
                message_parts.append("\n💡 Suggested Documentation Updates:")
                message_parts.append(suggestions)
            
            message_parts.append("\n📚 Related documentation files:")
            for doc in related_docs[:3]:
                message_parts.append(f"  - {Path(doc).relative_to(Path.cwd())}")
            
            message_parts.append("\nConsider running: Use Task tool with subagent_type='docs-sync' to update documentation")
            
            # Only show message if notifications enabled
            if config.get("notifications", {}).get("show_sub_agent_tips", True):
                print(json.dumps({
                    "decision": "approve",
                    "info": "\n".join(message_parts)
                }))
            else:
                print(json.dumps({"decision": "approve"}))
        else:
            print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()