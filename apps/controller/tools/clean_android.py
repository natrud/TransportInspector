from pathlib import Path
import shutil
import os
import stat

def rm(path: Path):
    if not path.exists():
        return
    def onerr(func, p, exc):
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except Exception:
            pass
    shutil.rmtree(path, onerror=onerr)
    print("removed:", path)

root = Path(__file__).resolve().parents[1]
targets = [
    root / "android" / "app" / ".cxx",
    root / "android" / "app" / "build",
    root / "android" / "build",
    root / "android" / ".gradle",
]

for t in targets:
    rm(t)
print("OK")
