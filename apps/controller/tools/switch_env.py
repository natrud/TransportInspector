from pathlib import Path
import sys

variant = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
if variant not in ("dev", "prod"):
    raise SystemExit("use: python tools/switch_env.py dev|prod")

root = Path(__file__).resolve().parents[1]
src = root / f".env.{variant}"
dst = root / ".env"

dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
print(f"OK: {dst.name} <- {src.name}")
