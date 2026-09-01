from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")

missing: list[str] = []
for path in ROOT.rglob("*.md"):
    if any(part in {".git", ".venv", ".pytest_cache", "dist"} for part in path.parts):
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    for target in LINK_RE.findall(text):
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        clean = target.split("#", 1)[0]
        if not clean:
            continue
        resolved = (path.parent / clean).resolve()
        if not resolved.exists():
            missing.append(f"{path.relative_to(ROOT)} -> {target}")

if missing:
    raise SystemExit("Broken relative markdown links:\n- " + "\n- ".join(missing))

print("link audit ok: all relative Markdown targets resolve")
