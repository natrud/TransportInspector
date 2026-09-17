"""
Converts src/data/streets.ts into backend app/api/streets_data.py
"""
import re, sys

TS = r"D:\Mega\FREELANCE\MARS_NEW_BC_DEV\mobile\src\data\streets.ts"
OUT = r"D:\Mega\FREELANCE\MARS_NEW_BC_DEV\backend\app\api\streets_data.py"

with open(TS, encoding="utf-8") as f:
    src = f.read()

# --- SETTLEMENTS ---
m = re.search(r'export const SETTLEMENTS[^=]*=\s*\[(.*?)\];', src, re.DOTALL)
settlements = re.findall(r'"([^"]+)"', m.group(1))

# --- STREETS_BY_SETTLEMENT ---
streets_by = {}
for block in re.finditer(r'"([^"]+)":\s*\[(.*?)\],', src, re.DOTALL):
    key = block.group(1)
    if key in settlements:
        items = re.findall(r'"([^"]+)"', block.group(2))
        streets_by[key] = items

# --- STREET_COORDS ---
coords = {}
for m in re.finditer(r'"([^"]+)":\s*\{\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)\s*\}', src):
    coords[m.group(1)] = (float(m.group(2)), float(m.group(3)))

# --- Write Python ---
lines = [
    "# Auto-generated from official Bila Tserkva community street registry",
    "# Source: mobile/src/data/streets.ts",
    "",
    "from typing import Dict, List, Tuple",
    "",
    "SETTLEMENTS: List[str] = [",
]
for s in settlements:
    lines.append(f'    "{s}",')
lines.append("]")
lines.append("")

lines.append("STREETS_BY_SETTLEMENT: Dict[str, List[str]] = {")
for s in settlements:
    lines.append(f'    "{s}": [')
    for street in streets_by.get(s, []):
        escaped = street.replace("\\", "\\\\").replace('"', '\\"')
        lines.append(f'        "{escaped}",')
    lines.append("    ],")
lines.append("}")
lines.append("")

lines.append("# key = 'settlement|street', value = (lat, lng)")
lines.append("STREET_COORDS: Dict[str, Tuple[float, float]] = {")
for key, (lat, lng) in coords.items():
    escaped_key = key.replace("\\", "\\\\").replace('"', '\\"')
    lines.append(f'    "{escaped_key}": ({lat}, {lng}),')
lines.append("}")
lines.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Written: {OUT}")
print(f"  Settlements: {len(settlements)}")
print(f"  Street groups: {len(streets_by)}")
print(f"  Coords: {len(coords)}")
