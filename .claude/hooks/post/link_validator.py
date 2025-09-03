#!/usr/bin/env python3
"""
Link Validator Hook - PostToolUse
Validates links and references in markdown documentation
"""

import json
import sys
import re
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager


class LinkValidator:
    """Validates links in markdown files"""
    
    def __init__(self):
        self.project_root = Path.cwd()
        self.checked_links_cache = {}
        
    def extract_links(self, content: str) -> List[Tuple[str, str, int]]:
        """Extract all links from markdown content
        Returns: List of (link_text, link_url, line_number)
        """
        links = []
        
        # Markdown link patterns
        patterns = [
            # [text](url) format
            (r'\[([^\]]+)\]\(([^\)]+)\)', 'markdown'),
            # Reference style [text][ref] (we'll check if ref is defined)
            (r'\[([^\]]+)\]\[([^\]]+)\]', 'reference'),
            # Direct file references in backticks (common in our docs)
            (r'`([\.\/]?(?:src|templates|docs|test)[\/\w\-\.]+)`', 'file_ref'),
            # See references: "→ see path/file.md"
            (r'→\s+see\s+([^\s]+)', 'see_ref'),
            # File paths in plain text (e.g., src/commands/CLAUDE.md)
            (r'(?:^|\s)((?:src|templates|docs|test)[\/\w\-\.]+\.(?:ts|tsx|js|jsx|md|json))', 'plain_path'),
        ]
        
        lines = content.split('\n')
        for line_num, line in enumerate(lines, 1):
            for pattern, link_type in patterns:
                for match in re.finditer(pattern, line):
                    if link_type == 'markdown':
                        link_text = match.group(1)
                        link_url = match.group(2)
                    elif link_type == 'reference':
                        link_text = match.group(1)
                        link_url = f"[{match.group(2)}]"  # Mark as reference
                    else:
                        link_text = match.group(0)
                        link_url = match.group(1)
                    
                    links.append((link_text, link_url, line_num))
        
        return links
    
    def validate_link(self, link_url: str, source_file: Path) -> Tuple[bool, Optional[str]]:
        """Validate a single link
        Returns: (is_valid, error_message)
        """
        # Skip external URLs
        if link_url.startswith(('http://', 'https://', 'mailto:')):
            return (True, None)  # Don't validate external links in this version
        
        # Skip anchor links
        if link_url.startswith('#'):
            # TODO: Could validate these against headers in the same file
            return (True, None)
        
        # Handle reference-style links
        if link_url.startswith('[') and link_url.endswith(']'):
            # TODO: Check if reference is defined in the document
            return (True, None)
        
        # Handle relative file paths
        if link_url.startswith(('./', '../', '/')):
            # Resolve relative to source file's directory
            source_dir = source_file.parent
            
            try:
                if link_url.startswith('/'):
                    # Absolute path from project root
                    target_path = self.project_root / link_url[1:]
                else:
                    # Relative path
                    target_path = (source_dir / link_url).resolve()
                
                # Remove anchor if present
                if '#' in str(target_path):
                    target_path = Path(str(target_path).split('#')[0])
                
                if target_path.exists():
                    return (True, None)
                else:
                    return (False, f"File not found: {target_path.relative_to(self.project_root)}")
            
            except Exception as e:
                return (False, f"Invalid path: {link_url}")
        
        # Handle plain file paths (without ./ or ../)
        if '/' in link_url and not link_url.startswith('#'):
            # Try as path from project root
            target_path = self.project_root / link_url
            
            # Remove anchor if present
            if '#' in str(target_path):
                target_path = Path(str(target_path).split('#')[0])
            
            if target_path.exists():
                return (True, None)
            else:
                return (False, f"File not found: {link_url}")
        
        return (True, None)  # Default to valid for unrecognized patterns
    
    def check_cross_references(self, doc_path: Path) -> List[Dict[str, Any]]:
        """Check if cross-references between documents are valid"""
        issues = []
        
        try:
            with open(doc_path, 'r') as f:
                content = f.read()
            
            # Extract all links
            links = self.extract_links(content)
            
            for link_text, link_url, line_num in links:
                # Cache check to avoid repeated validations
                cache_key = f"{doc_path}:{link_url}"
                if cache_key in self.checked_links_cache:
                    is_valid, error = self.checked_links_cache[cache_key]
                else:
                    is_valid, error = self.validate_link(link_url, doc_path)
                    self.checked_links_cache[cache_key] = (is_valid, error)
                
                if not is_valid:
                    issues.append({
                        'type': 'broken_link',
                        'link_text': link_text,
                        'link_url': link_url,
                        'doc_file': str(doc_path),
                        'line': line_num,
                        'error': error
                    })
        
        except Exception as e:
            # Silent fail
            pass
        
        return issues
    
    def find_orphaned_docs(self) -> List[str]:
        """Find documentation files that aren't linked from anywhere"""
        all_md_files = set(self.project_root.glob("**/*.md"))
        linked_files = set()
        
        # Check all markdown files for links
        for md_file in all_md_files:
            if '.git' in str(md_file) or 'node_modules' in str(md_file):
                continue
            
            try:
                with open(md_file, 'r') as f:
                    content = f.read()
                
                links = self.extract_links(content)
                for _, link_url, _ in links:
                    if link_url and '/' in link_url and not link_url.startswith('http'):
                        # Try to resolve the link
                        if link_url.startswith('/'):
                            target = self.project_root / link_url[1:]
                        else:
                            target = (md_file.parent / link_url).resolve()
                        
                        if target.exists():
                            linked_files.add(target)
            
            except Exception:
                pass
        
        # Find orphaned files
        orphaned = []
        for md_file in all_md_files:
            if '.git' in str(md_file) or 'node_modules' in str(md_file):
                continue
            
            # Skip README files and main docs
            if md_file.name in ['README.md', 'CHANGELOG.md', 'LICENSE.md']:
                continue
            
            if md_file not in linked_files and md_file != self.project_root / 'CLAUDE.md':
                orphaned.append(str(md_file.relative_to(self.project_root)))
        
        return orphaned


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Only process markdown file modifications
        tool_name = hook_input.get("tool_name", "")
        if tool_name not in ["Write", "Edit", "MultiEdit"]:
            print(json.dumps({"decision": "approve"}))
            return
        
        # Get file details
        tool_input = hook_input.get("tool_input", {})
        file_path = tool_input.get("file_path", "")
        
        # Only check markdown files
        if not file_path.endswith('.md'):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Initialize link validator
        validator = LinkValidator()
        
        # Check cross-references
        doc_path = Path(file_path)
        issues = validator.check_cross_references(doc_path)
        
        # If issues found, create a message
        if issues:
            message_parts = [f"🔗 Link validation issues found in {doc_path.name}:"]
            
            for issue in issues[:10]:  # Show first 10 issues
                message_parts.append(
                    f"  Line {issue['line']}: [{issue['link_text']}]({issue['link_url']})"
                )
                message_parts.append(f"    ❌ {issue['error']}")
            
            if len(issues) > 10:
                message_parts.append(f"  ... and {len(issues) - 10} more broken links")
            
            message_parts.append("\n💡 Fix these broken links to maintain documentation quality")
            
            # Check if this should block
            if config.get("quality_checks", {}).get("treat_warnings_as_errors", False):
                print(json.dumps({
                    "decision": "block",
                    "reason": "\n".join(message_parts)
                }))
            else:
                # Just inform, don't block
                if config.get("notifications", {}).get("show_sub_agent_tips", True):
                    print(json.dumps({
                        "decision": "approve",
                        "info": "\n".join(message_parts)
                    }))
                else:
                    print(json.dumps({"decision": "approve"}))
        else:
            # No issues found
            print(json.dumps({"decision": "approve"}))
        
    except Exception as e:
        # On error, don't block
        print(json.dumps({"decision": "approve"}))


if __name__ == "__main__":
    main()