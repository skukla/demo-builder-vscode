#!/usr/bin/env python3
"""
Smart Documentation Sync Hook - PostToolUse
Provides semi-automatic documentation updates with generated suggestions
"""

import json
import sys
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "lib"))

from state_manager import StateManager
from doc_generator import DocGenerator


class SmartDocSync:
    """Smart documentation synchronization with auto-generation"""
    
    def __init__(self, state_manager: StateManager, doc_generator: DocGenerator):
        self.state_manager = state_manager
        self.doc_generator = doc_generator
        self.project_root = Path.cwd()
        
    def should_generate_docs(self, file_path: str, tool_name: str) -> bool:
        """Determine if documentation generation is needed"""
        # Check if it's a significant file
        significant_extensions = ['.ts', '.tsx', '.js', '.jsx', '.py']
        if not any(file_path.endswith(ext) for ext in significant_extensions):
            return False
        
        # Check if it's a new file (Write tool with empty old_string)
        if tool_name == "Write":
            return True
        
        # Check if it's in a significant directory
        significant_dirs = ['components', 'commands', 'utils', 'hooks', 'providers']
        if any(dir_name in file_path for dir_name in significant_dirs):
            return True
        
        return False
    
    def generate_doc_draft(self, file_path: str, changes: Dict[str, Any]) -> str:
        """Generate a documentation draft for review"""
        draft_parts = []
        
        # Header
        draft_parts.append("="*60)
        draft_parts.append("📝 DOCUMENTATION UPDATE DRAFT")
        draft_parts.append("="*60)
        draft_parts.append("")
        
        # File information
        rel_path = Path(file_path).relative_to(self.project_root)
        draft_parts.append(f"**File Modified:** `{rel_path}`")
        
        # Find target documentation file
        doc_location = self.doc_generator.find_documentation_location(file_path)
        if doc_location:
            doc_rel_path = Path(doc_location).relative_to(self.project_root)
            draft_parts.append(f"**Target Documentation:** `{doc_rel_path}`")
        
        draft_parts.append("")
        
        # Generate documentation suggestions
        language = self._detect_language(file_path)
        suggestions = self.doc_generator.generate_doc_suggestion(changes, file_path, language)
        draft_parts.append(suggestions)
        
        # Add instructions
        draft_parts.append("\n" + "="*60)
        draft_parts.append("📋 TO APPLY THESE UPDATES:")
        draft_parts.append("="*60)
        draft_parts.append("")
        draft_parts.append("1. Review the suggestions above")
        draft_parts.append("2. Run: Use Task tool with subagent_type='docs-sync'")
        draft_parts.append("3. The docs-sync agent will:")
        draft_parts.append("   - Apply the relevant updates")
        draft_parts.append("   - Ensure consistency across documentation")
        draft_parts.append("   - Update cross-references")
        draft_parts.append("")
        draft_parts.append("Or manually edit the documentation files listed above.")
        
        return "\n".join(draft_parts)
    
    def _detect_language(self, file_path: str) -> str:
        """Detect programming language from file extension"""
        ext_to_lang = {
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.py': 'python',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
        }
        
        ext = Path(file_path).suffix
        return ext_to_lang.get(ext, 'typescript')
    
    def save_doc_draft(self, draft: str, file_path: str) -> str:
        """Save documentation draft for later reference"""
        # Create drafts directory in state
        drafts_dir = Path(__file__).parent.parent / "state" / "doc_drafts"
        drafts_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate draft filename
        file_name = Path(file_path).stem
        draft_file = drafts_dir / f"{file_name}_{self.state_manager._generate_session_id()}.md"
        
        # Save draft
        with open(draft_file, 'w') as f:
            f.write(draft)
        
        return str(draft_file)


def main():
    try:
        # Read hook input
        hook_input = json.loads(sys.stdin.read())
        
        # Load configuration
        config_path = Path(__file__).parent.parent / "config.json"
        with open(config_path, 'r') as f:
            config = json.load(f)
        
        # Check if smart doc sync is enabled
        if not config.get("sub_agents", {}).get("docs-sync", {}).get("enabled", False):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Only process significant file modifications
        tool_name = hook_input.get("tool_name", "")
        if tool_name not in ["Write", "Edit", "MultiEdit"]:
            print(json.dumps({"decision": "approve"}))
            return
        
        # Get file details
        tool_input = hook_input.get("tool_input", {})
        file_path = tool_input.get("file_path", "")
        
        # Initialize components
        state_manager = StateManager()
        doc_generator = DocGenerator()
        smart_sync = SmartDocSync(state_manager, doc_generator)
        
        # Check if documentation generation is needed
        if not smart_sync.should_generate_docs(file_path, tool_name):
            print(json.dumps({"decision": "approve"}))
            return
        
        # Analyze changes (simplified for new files)
        changes = {
            'added_functions': [],
            'removed_functions': [],
            'modified_functions': [],
            'added_classes': [],
            'removed_classes': [],
            'added_exports': [],
            'removed_exports': [],
            'signature_changes': []
        }
        
        # For edits, try to analyze changes
        if tool_name in ["Edit", "MultiEdit"]:
            old_content = tool_input.get("old_string", "")
            new_content = tool_input.get("new_string", "")
            
            if old_content and new_content:
                changes = doc_generator.analyze_code_changes(file_path, old_content, new_content)
        
        # For new files, analyze the content
        elif tool_name == "Write":
            new_content = tool_input.get("content", "")
            if new_content:
                # Treat everything as "added"
                functions = doc_generator._extract_functions(new_content)
                changes['added_functions'] = list(functions.keys())
                
                classes = doc_generator._extract_classes(new_content)
                changes['added_classes'] = classes
                
                exports = doc_generator._extract_exports(new_content)
                changes['added_exports'] = exports
        
        # If we found significant changes, generate documentation draft
        if any(changes.values()):
            # Generate draft
            draft = smart_sync.generate_doc_draft(file_path, changes)
            
            # Save draft for reference
            draft_file = smart_sync.save_doc_draft(draft, file_path)
            
            # Track that documentation is needed
            state_manager.track_modification(file_path, f"{tool_name}_needs_doc")
            
            # Create message
            message = f"""📚 Documentation Draft Generated

{draft}

💾 Draft saved to: {Path(draft_file).name}

This draft will help the docs-sync agent update documentation more accurately."""
            
            # Check if this should block (for major changes)
            if config.get("sub_agents", {}).get("docs-sync", {}).get("block_on_major_changes", False):
                if len(changes.get('added_classes', [])) > 0 or len(changes.get('signature_changes', [])) > 2:
                    print(json.dumps({
                        "decision": "block",
                        "reason": message
                    }))
                    return
            
            # Otherwise just inform
            if config.get("notifications", {}).get("show_sub_agent_tips", True):
                print(json.dumps({
                    "decision": "approve",
                    "info": message
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