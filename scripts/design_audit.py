from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "app" / "campus_twin" / "static" / "styles.css").read_text(encoding="utf-8")
HTML = (ROOT / "app" / "campus_twin" / "static" / "index.html").read_text(encoding="utf-8")
DESIGN = (ROOT / "DESIGN.md").read_text(encoding="utf-8")

violations: list[str] = []

for token in ("linear-gradient", "radial-gradient", "conic-gradient", "backdrop-filter", "glassmorphism"):
    if token in CSS.lower():
        violations.append(f"forbidden visual primitive in CSS: {token}")

# Very large radii are a common generated-dashboard default. Small circles used for
# status dots are intentionally expressed as 50% and do not match this rule.
for match in re.finditer(r"border-radius\s*:\s*(\d+)px", CSS):
    if int(match.group(1)) > 8:
        violations.append(f"border radius exceeds interface contract: {match.group(0)}")

# Flag explicit sub-11px functional text in both longhand and shorthand declarations.
for match in re.finditer(r"font-size\s*:\s*(\d+(?:\.\d+)?)px", CSS):
    if float(match.group(1)) < 11:
        violations.append(f"font size below 11px: {match.group(0)}")
for match in re.finditer(r"font\s*:[^;{}]*?\b(\d+(?:\.\d+)?)px(?:/[^ ;{}]+)?\b", CSS):
    if float(match.group(1)) < 11:
        violations.append(f"font shorthand below 11px: {match.group(0)}")

for class_name in ("hero", "eyebrow", "glass", "glow"):
    if re.search(rf'class="[^"]*\b{class_name}\b', HTML, re.IGNORECASE):
        violations.append(f"slop-prone presentation class present: {class_name}")

if "impeccable" not in DESIGN.lower() or "slop" not in DESIGN.lower():
    violations.append("DESIGN.md does not preserve the Impeccable anti-slop review contract")

if violations:
    raise SystemExit("Design audit failed:\n- " + "\n- ".join(violations))

print("design audit ok: no gradients/glass, no oversized radii, no sub-11px functional text")
