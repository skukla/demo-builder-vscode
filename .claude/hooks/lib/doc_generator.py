#!/usr/bin/env python3
"""
Documentation Generator Library
Generates and suggests documentation updates automatically
"""

import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime


class DocGenerator:
    """Generates documentation suggestions based on code changes"""
    
    def __init__(self):
        self.project_root = Path.cwd()
        self.templates = self._load_templates()
        
    def _load_templates(self) -> Dict[str, str]:
        """Load documentation templates"""
        return {
            'function': """### `{name}()`
{description}

**Parameters:**
{params}

**Returns:** {returns}

**Example:**
```{language}
{example}
```
""",
            'class': """### {name}
{description}

**Constructor:**
```{language}
{constructor}
```

**Methods:**
{methods}

**Usage:**
```{language}
{usage}
```
""",
            'component': """### {name} Component
{description}

**Props:**
{props}

**Example:**
```{language}
{example}
```

**Notes:**
{notes}
""",
            'hook': """### {name} Hook
{description}

**Parameters:**
{params}

**Returns:**
{returns}

**Example:**
```{language}
{example}
```
""",
            'update_entry': """
#### {date} - {change_type}
- **File:** `{file_path}`
- **Change:** {description}
- **Impact:** {impact}
"""
        }
    
    def analyze_code_changes(self, file_path: str, old_content: str, new_content: str) -> Dict[str, Any]:
        """Analyze what changed in the code"""
        changes = {
            'added_functions': [],
            'removed_functions': [],
            'modified_functions': [],
            'added_classes': [],
            'removed_classes': [],
            'added_exports': [],
            'removed_exports': [],
            'added_imports': [],
            'signature_changes': []
        }
        
        # Extract functions from old and new
        old_functions = self._extract_functions(old_content)
        new_functions = self._extract_functions(new_content)
        
        # Compare functions
        old_func_names = set(old_functions.keys())
        new_func_names = set(new_functions.keys())
        
        changes['added_functions'] = list(new_func_names - old_func_names)
        changes['removed_functions'] = list(old_func_names - new_func_names)
        
        # Check for signature changes
        for func_name in old_func_names & new_func_names:
            if old_functions[func_name] != new_functions[func_name]:
                changes['modified_functions'].append(func_name)
                changes['signature_changes'].append({
                    'name': func_name,
                    'old': old_functions[func_name],
                    'new': new_functions[func_name]
                })
        
        # Extract classes
        old_classes = self._extract_classes(old_content)
        new_classes = self._extract_classes(new_content)
        
        changes['added_classes'] = list(set(new_classes) - set(old_classes))
        changes['removed_classes'] = list(set(old_classes) - set(new_classes))
        
        # Extract exports
        old_exports = self._extract_exports(old_content)
        new_exports = self._extract_exports(new_content)
        
        changes['added_exports'] = list(set(new_exports) - set(old_exports))
        changes['removed_exports'] = list(set(old_exports) - set(new_exports))
        
        return changes
    
    def _extract_functions(self, content: str) -> Dict[str, str]:
        """Extract function signatures from code"""
        functions = {}
        
        # TypeScript/JavaScript function patterns
        patterns = [
            # Regular functions: function name(params)
            r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)',
            # Arrow functions: const name = (params) =>
            r'(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>',
            # Method declarations: name(params) {
            r'(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*[\w\[\]<>]+)?\s*\{',
        ]
        
        for pattern in patterns:
            for match in re.finditer(pattern, content):
                func_name = match.group(1)
                params = match.group(2).strip()
                functions[func_name] = params
        
        return functions
    
    def _extract_classes(self, content: str) -> List[str]:
        """Extract class names from code"""
        classes = []
        
        # Class pattern
        pattern = r'(?:export\s+)?(?:abstract\s+)?class\s+(\w+)'
        for match in re.finditer(pattern, content):
            classes.append(match.group(1))
        
        return classes
    
    def _extract_exports(self, content: str) -> List[str]:
        """Extract exported items from code"""
        exports = []
        
        # Export patterns
        patterns = [
            r'export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)',
            r'export\s+\{\s*([^}]+)\s*\}',
            r'export\s+default\s+(\w+)',
        ]
        
        for pattern in patterns:
            for match in re.finditer(pattern, content):
                if pattern == patterns[1]:  # Handle multiple exports
                    items = match.group(1).split(',')
                    for item in items:
                        item = item.strip().split(' as ')[0]
                        exports.append(item)
                else:
                    exports.append(match.group(1))
        
        return exports
    
    def generate_doc_suggestion(self, changes: Dict[str, Any], file_path: str, 
                                language: str = 'typescript') -> str:
        """Generate documentation suggestion based on changes"""
        suggestions = []
        
        # Header
        suggestions.append(f"## Documentation Update Suggestion for {Path(file_path).name}\n")
        
        # Added functions
        if changes['added_functions']:
            suggestions.append("### New Functions to Document\n")
            for func_name in changes['added_functions']:
                template = self.templates['function']
                suggestions.append(template.format(
                    name=func_name,
                    description="[TODO: Add description]",
                    params="[TODO: Document parameters]",
                    returns="[TODO: Document return value]",
                    language=language,
                    example=f"{func_name}(); // TODO: Add example"
                ))
        
        # Added classes
        if changes['added_classes']:
            suggestions.append("### New Classes to Document\n")
            for class_name in changes['added_classes']:
                template = self.templates['class']
                suggestions.append(template.format(
                    name=class_name,
                    description="[TODO: Add description]",
                    language=language,
                    constructor=f"new {class_name}(); // TODO: Document constructor",
                    methods="[TODO: Document methods]",
                    usage=f"const instance = new {class_name}(); // TODO: Add usage example"
                ))
        
        # Signature changes
        if changes['signature_changes']:
            suggestions.append("### Function Signature Changes\n")
            suggestions.append("Update documentation for these functions with modified signatures:\n")
            for change in changes['signature_changes']:
                suggestions.append(f"- **{change['name']}**")
                suggestions.append(f"  - Old: `{change['name']}({change['old']})`")
                suggestions.append(f"  - New: `{change['name']}({change['new']})`")
                suggestions.append("")
        
        # Removed items
        if changes['removed_functions'] or changes['removed_classes']:
            suggestions.append("### Deprecated/Removed Items\n")
            suggestions.append("Remove or mark as deprecated in documentation:\n")
            for func in changes['removed_functions']:
                suggestions.append(f"- Function: `{func}()`")
            for cls in changes['removed_classes']:
                suggestions.append(f"- Class: `{cls}`")
            suggestions.append("")
        
        # Update log
        suggestions.append("### Suggested Update Log Entry\n")
        suggestions.append(self.templates['update_entry'].format(
            date=datetime.now().strftime('%Y-%m-%d'),
            change_type="Code Update",
            file_path=Path(file_path).relative_to(self.project_root),
            description=self._summarize_changes(changes),
            impact=self._assess_impact(changes)
        ))
        
        return "\n".join(suggestions)
    
    def _summarize_changes(self, changes: Dict[str, Any]) -> str:
        """Create a summary of changes"""
        summary_parts = []
        
        if changes['added_functions']:
            summary_parts.append(f"Added {len(changes['added_functions'])} function(s)")
        if changes['added_classes']:
            summary_parts.append(f"Added {len(changes['added_classes'])} class(es)")
        if changes['modified_functions']:
            summary_parts.append(f"Modified {len(changes['modified_functions'])} function(s)")
        if changes['removed_functions']:
            summary_parts.append(f"Removed {len(changes['removed_functions'])} function(s)")
        
        return ", ".join(summary_parts) if summary_parts else "Minor updates"
    
    def _assess_impact(self, changes: Dict[str, Any]) -> str:
        """Assess the impact of changes"""
        # High impact: removed items or signature changes
        if changes['removed_functions'] or changes['removed_classes'] or changes['signature_changes']:
            return "Breaking changes - update dependent code"
        # Medium impact: new exports
        elif changes['added_exports']:
            return "New API surface - update public documentation"
        # Low impact: internal changes
        else:
            return "Internal changes - no API impact"
    
    def find_documentation_location(self, file_path: str) -> Optional[str]:
        """Find where documentation for a file should go"""
        file_path_obj = Path(file_path)
        
        # Check for CLAUDE.md in same directory
        same_dir_claude = file_path_obj.parent / "CLAUDE.md"
        if same_dir_claude.exists():
            return str(same_dir_claude)
        
        # Check parent directories
        for parent in file_path_obj.parents:
            claude_md = parent / "CLAUDE.md"
            if claude_md.exists() and claude_md.is_relative_to(self.project_root):
                return str(claude_md)
        
        # Special cases
        if "webviews/components" in str(file_path):
            return str(self.project_root / "src/webviews/CLAUDE.md")
        elif "commands" in str(file_path):
            return str(self.project_root / "src/commands/CLAUDE.md")
        elif "utils" in str(file_path):
            return str(self.project_root / "src/utils/CLAUDE.md")
        
        # Default to root CLAUDE.md
        return str(self.project_root / "CLAUDE.md")
    
    def create_component_docs(self, component_name: str, props: Dict[str, str]) -> str:
        """Generate documentation for a React component"""
        template = self.templates['component']
        
        props_doc = "\n".join([f"- **{name}**: {type_}" for name, type_ in props.items()])
        
        return template.format(
            name=component_name,
            description="[TODO: Add component description]",
            props=props_doc if props_doc else "No props",
            language="tsx",
            example=f"<{component_name} />",
            notes="[TODO: Add usage notes]"
        )