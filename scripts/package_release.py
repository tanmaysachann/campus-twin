from __future__ import annotations

import argparse
import hashlib
import shutil
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VERSION = "1.0.0"
SKIP_DIRS = {".git", ".venv", ".pytest_cache", "__pycache__", "dist", ".mypy_cache", ".ruff_cache"}
SKIP_SUFFIXES = {".pyc", ".pyo"}


def include(path: Path) -> bool:
    rel = path.relative_to(ROOT)
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if path.suffix in SKIP_SUFFIXES:
        return False
    return True


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file():
            yield path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a clean CampusTwin release ZIP with internal SHA-256 manifest.")
    parser.add_argument("--version", default=DEFAULT_VERSION)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    output = args.output or (ROOT / "dist" / f"CampusTwin-{args.version}.zip")
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="campus-twin-release-") as tmp:
        stage = Path(tmp) / "campus-twin"
        stage.mkdir()

        for source in iter_files(ROOT):
            if not include(source):
                continue
            # Never recursively package an existing release artifact outside dist.
            if source.resolve() == output:
                continue
            relative = source.relative_to(ROOT)
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

        sums = []
        for path in iter_files(stage):
            if path.name == "SHA256SUMS.txt":
                continue
            sums.append(f"{sha256(path)}  {path.relative_to(stage).as_posix()}")
        (stage / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")

        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in iter_files(stage):
                archive.write(path, Path("campus-twin") / path.relative_to(stage))

    with zipfile.ZipFile(output) as archive:
        names = set(archive.namelist())
        required = {
            "campus-twin/README.md",
            "campus-twin/START_HERE.md",
            "campus-twin/DESIGN.md",
            "campus-twin/databricks.yml",
            "campus-twin/app/app.yaml",
            "campus-twin/app/campus_twin/main.py",
            "campus-twin/app/campus_twin/static/index.html",
            "campus-twin/tests/test_simulation.py",
            "campus-twin/SHA256SUMS.txt",
        }
        missing = sorted(required - names)
        forbidden = [name for name in names if "/__pycache__/" in name or "/.pytest_cache/" in name or name.endswith(".pyc")]
        if missing or forbidden:
            raise SystemExit(f"release verification failed: missing={missing}, forbidden={forbidden[:5]}")
        bad = archive.testzip()
        if bad:
            raise SystemExit(f"ZIP CRC verification failed at {bad}")

    print(f"release zip: {output}")
    print(f"release sha256: {sha256(output)}")
    print(f"release bytes: {output.stat().st_size}")


if __name__ == "__main__":
    main()
