"""
Regenerates src/data/streets.ts with STREET_COORDS lookup.
CSV format:
  - Villages: "с. VillageName - street_name"
  - Bila Tserkva: just "street_name" (no separator, may have \xa0 after type prefix)
"""
import re
import sys
from collections import defaultdict

JSONL_PATH = r"C:\Users\natrud\.claude\projects\d--Mega-FREELANCE-MARS-NEW-BC-DEV-mobile\1616c3ee-5667-44af-994e-72fc4cdc528b.jsonl"
OUT_PATH = r"D:\Mega\FREELANCE\MARS_NEW_BC_DEV\mobile\src\data\streets.ts"

with open(JSONL_PATH, 'rb') as f:
    content = f.read()

point_pattern = re.compile(
    rb'"POINT \(([0-9.]+) ([0-9.]+)\)\\",([^,\n]+),([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)'
)

def fix_double_utf8(raw_bytes: bytes) -> str:
    s = raw_bytes.decode('utf-8', errors='replace')
    b = s.encode('latin-1', errors='replace')
    return b.decode('utf-8', errors='replace')

# Normalize non-breaking spaces to regular spaces
def normalize(s: str) -> str:
    return s.replace('\xa0', ' ').strip()

VALID_SETTLEMENTS = {
    'с. Вільна Тарасівка', 'с. Володимирівка', 'с. Гайок', 'с. Глибочка',
    'с. Глушки', 'с. Городище', 'с. Дрозди', 'с. Мазепинці', 'с. Пилипча',
    'с. Піщана', 'с. Сидори', 'с. Скребиші', 'с-ще Терезине',
    'с. Томилівка', 'с. Храпачі', 'с. Шкарівка',
}
STREET_PREFIXES = (
    'вулиця ', 'провулок ', 'бульвар ', 'проспект ', 'площа ',
    'узвіз ', 'набережна ', 'алея ', 'тупик ', 'шосе ', 'завулок ',
)

final: dict[str, list[tuple[str, float, float]]] = defaultdict(list)
seen = set()

for m in point_pattern.finditer(content):
    _, _, name_raw, lon, lat = m.groups()
    full_name = normalize(fix_double_utf8(name_raw))
    lon_f = float(lon)
    lat_f = float(lat)

    if full_name in seen:
        continue
    seen.add(full_name)

    if ' - ' in full_name:
        settlement, street = full_name.split(' - ', 1)
        settlement = settlement.strip()
        street = normalize(street)
        if settlement in VALID_SETTLEMENTS:
            final[settlement].append((street, lon_f, lat_f))
    elif any(full_name.startswith(p) for p in STREET_PREFIXES):
        final['Біла Церква'].append((full_name, lon_f, lat_f))

print(f"Total streets with coords: {sum(len(v) for v in final.values())}", file=sys.stderr)
for s, entries in sorted(final.items()):
    print(f"  {s}: {len(entries)}", file=sys.stderr)

# Build TypeScript
settlements_order = [
    'Біла Церква',
    'с-ще Терезине',
    'с. Володимирівка',
    'с. Вільна Тарасівка',
    'с. Гайок',
    'с. Глибочка',
    'с. Глушки',
    'с. Городище',
    'с. Дрозди',
    'с. Мазепинці',
    'с. Пилипча',
    'с. Піщана',
    'с. Сидори',
    'с. Скребиші',
    'с. Томилівка',
    'с. Храпачі',
    'с. Шкарівка',
]

lines = [
    '// Auto-generated from official Bila Tserkva community street registry',
    '',
    'export const SETTLEMENTS: string[] = [',
]
for s in settlements_order:
    lines.append(f'  "{s}",')
lines.append('];')
lines.append('')

lines.append('export const STREETS_BY_SETTLEMENT: Record<string, string[]> = {')
for settlement in settlements_order:
    entries = sorted(final.get(settlement, []), key=lambda x: x[0])
    lines.append(f'  "{settlement}": [')
    for street, _, _ in entries:
        escaped = street.replace('\\', '\\\\').replace('"', '\\"')
        lines.append(f'    "{escaped}",')
    lines.append('  ],')
lines.append('};')
lines.append('')

lines.append('export const STREET_COORDS: Record<string, { lat: number; lng: number }> = {')
for settlement in settlements_order:
    entries = sorted(final.get(settlement, []), key=lambda x: x[0])
    for street, lon, lat in entries:
        key = f'{settlement}|{street}'.replace('\\', '\\\\').replace('"', '\\"')
        lines.append(f'  "{key}": {{ lat: {lat}, lng: {lon} }},')
lines.append('};')
lines.append('')

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f"Written: {OUT_PATH}", file=sys.stderr)
