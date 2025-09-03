#!/usr/bin/env python3
"""
Documentation Coverage Report
Generates a comprehensive documentation coverage report for the codebase
"""

import sys
import json
from pathlib import Path
from typing import Optional

# Add lib directory to path
sys.path.insert(0, str(Path(__file__).parent / "lib"))

from doc_coverage import DocCoverageAnalyzer


def print_coverage_bar(percentage: float, width: int = 30) -> str:
    """Generate a visual coverage bar"""
    filled = int((percentage / 100) * width)
    empty = width - filled
    
    if percentage >= 80:
        color = "\033[92m"  # Green
    elif percentage >= 50:
        color = "\033[93m"  # Yellow
    else:
        color = "\033[91m"  # Red
    
    reset = "\033[0m"
    
    bar = f"{color}{'█' * filled}{'░' * empty}{reset}"
    return f"{bar} {percentage:.1f}%"


def generate_report(directory: Optional[str] = None):
    """Generate and display documentation coverage report"""
    
    print("\n" + "="*60)
    print("📊 DOCUMENTATION COVERAGE REPORT")
    print("="*60 + "\n")
    
    # Initialize analyzer
    analyzer = DocCoverageAnalyzer()
    
    # Generate report
    report = analyzer.generate_coverage_report(directory)
    
    # Display overall statistics
    print("📈 Overall Statistics:")
    print(f"   Total Files: {report['total_files']}")
    print(f"   Fully Documented: {report['documented_files']} ✅")
    print(f"   Partially Documented: {report['partially_documented_files']} ⚠️")
    print(f"   Undocumented: {report['undocumented_files']} ❌")
    print(f"   Overall Coverage: {print_coverage_bar(report['overall_coverage'])}")
    print()
    
    # Display coverage by directory
    if report['by_directory']:
        print("📁 Coverage by Directory:")
        print("-" * 60)
        
        # Sort directories by coverage (lowest first)
        sorted_dirs = sorted(
            report['by_directory'].items(),
            key=lambda x: x[1]['coverage']
        )
        
        for dir_name, data in sorted_dirs[:10]:  # Show top 10
            coverage = data['coverage']
            undoc_count = len(data['undocumented_items'])
            
            print(f"   {dir_name}")
            print(f"      Files: {data['files']} | Coverage: {print_coverage_bar(coverage)}")
            
            if undoc_count > 0:
                print(f"      Undocumented items: {undoc_count}")
                # Show first 3 undocumented items
                for item in data['undocumented_items'][:3]:
                    print(f"        - {item['type']}: {item['name']}")
                if undoc_count > 3:
                    print(f"        ... and {undoc_count - 3} more")
            print()
    
    # Display suggestions
    if report['suggestions']:
        print("💡 Suggestions for Improvement:")
        print("-" * 60)
        for suggestion in report['suggestions']:
            print(f"   • {suggestion}")
        print()
    
    # Find completely undocumented files
    undocumented_files = []
    for dir_name, data in report['by_directory'].items():
        if data['coverage'] == 0:
            undocumented_files.append(dir_name)
    
    if undocumented_files:
        print("⚠️ Completely Undocumented Directories:")
        print("-" * 60)
        for dir_name in undocumented_files[:5]:
            print(f"   • {dir_name}")
        if len(undocumented_files) > 5:
            print(f"   ... and {len(undocumented_files) - 5} more")
        print()
    
    # Generate action items
    print("📝 Recommended Actions:")
    print("-" * 60)
    
    if report['overall_coverage'] < 30:
        print("   1. CRITICAL: Documentation coverage is very low!")
        print("      Start by documenting public APIs and exported functions")
    elif report['overall_coverage'] < 60:
        print("   1. Documentation coverage needs improvement")
        print("      Focus on documenting complex components and utilities")
    else:
        print("   1. Good documentation coverage!")
        print("      Continue maintaining documentation as you add features")
    
    print("   2. Run: Use Task tool with subagent_type='docs-sync'")
    print("      to automatically update existing documentation")
    
    print("   3. Use the auto-generated documentation drafts")
    print("      when creating new files to maintain consistency")
    
    print("\n" + "="*60)
    print("END OF REPORT")
    print("="*60 + "\n")
    
    # Save report to file
    report_file = Path(__file__).parent / "state" / "coverage_report.json"
    report_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(report_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"📄 Full report saved to: {report_file.relative_to(Path.cwd())}")


def main():
    """Main entry point"""
    
    # Check for command-line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--help" or sys.argv[1] == "-h":
            print("Usage: python3 doc_coverage_report.py [directory]")
            print("\nGenerates a documentation coverage report for the specified directory")
            print("or the entire src/ directory if no directory is specified.")
            print("\nExamples:")
            print("  python3 doc_coverage_report.py")
            print("  python3 doc_coverage_report.py src/webviews")
            print("  python3 doc_coverage_report.py src/commands")
            return
        
        directory = sys.argv[1]
    else:
        directory = None
    
    try:
        generate_report(directory)
    except Exception as e:
        print(f"❌ Error generating report: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()