#!/usr/bin/env python3
"""
check_secrets.py — Local pre-commit secret scanner
====================================================
Scans staged (or all) files for patterns that look like API keys,
connection strings, or other high-entropy secrets.

Usage:
    # Scan all tracked files:
    python backend/scripts/check_secrets.py

    # Install as a git pre-commit hook (run once):
    python backend/scripts/check_secrets.py --install-hook

Patterns checked:
    - Supabase anon/service role keys (eyJ... JWTs)
    - OpenAI keys (sk-proj-...)
    - OpenWeatherMap keys (32-char hex)
    - Generic high-entropy strings >40 chars
    - .env files with real values (not placeholders)
"""

import re
import sys
import os
import subprocess
import argparse
from pathlib import Path

# Files to always skip
SKIP_PATTERNS = [
    ".env.example",
    ".venv",
    "node_modules",
    ".git",
    "__pycache__",
    "*.pkl",
    "*.lock",
    "package-lock.json",
]

# Regex patterns for known secret formats
SECRET_PATTERNS = [
    # OpenAI keys
    (re.compile(r"sk-proj-[A-Za-z0-9_-]{40,}"), "OpenAI API key"),
    (re.compile(r"sk-[A-Za-z0-9]{48}"), "OpenAI API key (legacy)"),
    # Supabase JWT (starts with eyJ)
    (re.compile(r'eyJ[A-Za-z0-9_-]{100,}'), "Supabase/JWT token"),
    # OpenWeatherMap — 32-char hex
    (re.compile(r'(?<![A-Za-z0-9])[0-9a-f]{32}(?![A-Za-z0-9])'), "Possible OWM/hex API key"),
    # Generic: assignment of a long string (env-style)
    (re.compile(r'(?:KEY|TOKEN|SECRET|PASSWORD|APIKEY)\s*=\s*["\']?[A-Za-z0-9_/+=.-]{30,}', re.I), "Generic secret assignment"),
    # Supabase URL pattern
    (re.compile(r'https://[a-z]{20,}\.supabase\.co'), "Supabase project URL"),
]

PLACEHOLDER_WORDS = {"<your", "placeholder", "example", "changeme", "xxxx", "your_"}


def should_skip(path: Path) -> bool:
    for pat in SKIP_PATTERNS:
        if pat.startswith("*"):
            if path.suffix == pat[1:]:
                return True
        elif pat in path.parts or pat in str(path):
            return True
    return False


def is_placeholder(value: str) -> bool:
    lower = value.lower()
    return any(word in lower for word in PLACEHOLDER_WORDS)


def scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Returns list of (line_number, matched_text, pattern_name)."""
    findings = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return findings

    for i, line in enumerate(text.splitlines(), 1):
        for pattern, name in SECRET_PATTERNS:
            for match in pattern.finditer(line):
                if not is_placeholder(match.group()):
                    findings.append((i, match.group()[:60] + "...", name))
    return findings


def get_staged_files() -> list[Path]:
    """Get files currently staged for commit."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            capture_output=True, text=True, check=True
        )
        return [Path(f) for f in result.stdout.splitlines() if f]
    except subprocess.CalledProcessError:
        return []


def get_all_tracked_files() -> list[Path]:
    """Get all tracked files in the repo."""
    try:
        result = subprocess.run(
            ["git", "ls-files"],
            capture_output=True, text=True, check=True
        )
        return [Path(f) for f in result.stdout.splitlines() if f]
    except subprocess.CalledProcessError:
        root = Path(__file__).parent.parent.parent
        return [p for p in root.rglob("*") if p.is_file()]


def install_hook():
    """Install this script as a git pre-commit hook."""
    git_root = Path(__file__).parent.parent.parent
    hook_path = git_root / ".git" / "hooks" / "pre-commit"
    hook_content = f"""#!/bin/sh
python "{Path(__file__).resolve()}" --staged
exit $?
"""
    hook_path.write_text(hook_content)
    # Make executable on Unix
    if sys.platform != "win32":
        hook_path.chmod(0o755)
    print(f"✅ Pre-commit hook installed at {hook_path}")


def main():
    parser = argparse.ArgumentParser(description="Scan for committed secrets")
    parser.add_argument("--staged", action="store_true", help="Only scan staged files")
    parser.add_argument("--install-hook", action="store_true", help="Install as git pre-commit hook")
    args = parser.parse_args()

    if args.install_hook:
        install_hook()
        return

    files = get_staged_files() if args.staged else get_all_tracked_files()
    total_findings = 0

    for f in files:
        if should_skip(f) or not f.exists() or not f.is_file():
            continue
        findings = scan_file(f)
        if findings:
            print(f"\n⚠️  {f}")
            for line_no, snippet, name in findings:
                print(f"   Line {line_no:4d}: [{name}] {snippet}")
            total_findings += len(findings)

    if total_findings:
        print(f"\n❌ {total_findings} potential secret(s) found. Rotate any real keys before committing.")
        sys.exit(1)
    else:
        print(f"✅ No secrets found in {len(files)} scanned file(s).")


if __name__ == "__main__":
    main()
