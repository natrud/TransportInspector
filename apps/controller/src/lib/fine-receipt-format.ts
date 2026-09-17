import {
  type Fine,
  FINE_DOC_LABELS,
  FINE_MULTIPLIER,
  FINE_REASON_LABELS,
  formatPrice,
} from '@transport/shared';

/**
 * Текстова версія квитанції — для Share sheet і для побудови HTML під
 * термопринтер (57 мм). Ширина рядка ~32 символи (стандарт для 58 мм/8-точкового
 * моноспейс шрифту).
 */

const WIDTH = 32;

function center(text: string): string {
  if (text.length >= WIDTH) return text;
  const pad = Math.floor((WIDTH - text.length) / 2);
  return ' '.repeat(pad) + text;
}

function rule(char = '='): string {
  return char.repeat(WIDTH);
}

function pad(label: string, value: string): string {
  const free = WIDTH - label.length - value.length;
  return free > 0 ? `${label}${' '.repeat(free)}${value}` : `${label} ${value}`;
}

function formatDateUa(ms: number): string {
  const d = new Date(ms);
  const dd = `${d.getDate()}`.padStart(2, '0');
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = `${d.getHours()}`.padStart(2, '0');
  const min = `${d.getMinutes()}`.padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function wrap(text: string, width = WIDTH): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= width) {
      cur += ` ${w}`;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length > 0 ? lines : [''];
}

export function buildReceiptText(fine: Fine): string {
  const lines: string[] = [];
  lines.push(rule('='));
  lines.push(center('ПОСТАНОВА ПРО ШТРАФ'));
  lines.push(center('за ст. 135 КУпАП'));
  lines.push(rule('='));
  lines.push('');
  lines.push(pad('Дата/час:', formatDateUa(fine.created_at)));
  lines.push(pad('Контролер:', fine.controller_serial));
  if (fine.route_id) lines.push(pad('Маршрут:', fine.route_id));
  if (fine.ticket_id) lines.push(pad('Квиток:', fine.ticket_id));
  lines.push(rule('-'));
  lines.push('Порушник:');
  for (const l of wrap(fine.offender_name)) lines.push(l);
  lines.push(`${FINE_DOC_LABELS[fine.doc_type]} ${fine.doc_number}`);
  lines.push('');
  lines.push('Причина:');
  for (const l of wrap(FINE_REASON_LABELS[fine.reason])) lines.push(l);
  if (fine.location_note) {
    lines.push('');
    lines.push('Місце:');
    for (const l of wrap(fine.location_note)) lines.push(l);
  }
  lines.push(rule('-'));
  lines.push(pad('Ціна квитка:', formatPrice(fine.base_fare_kopecks)));
  lines.push(pad('Множник:', `× ${FINE_MULTIPLIER}`));
  lines.push(pad('СУМА:', formatPrice(fine.fine_amount_kopecks)));
  lines.push(rule('-'));
  lines.push(pad('ID:', fine.id));
  lines.push('');
  lines.push(center('[QR на оплату]'));
  lines.push(center('Сплатити протягом 15 днів'));
  lines.push(rule('='));
  return lines.join('\n');
}

/** Контент QR для оплати/контролю — JSON з ключовими полями. */
export function buildReceiptQrPayload(fine: Fine): string {
  return JSON.stringify({
    fine_id: fine.id,
    amount_kopecks: fine.fine_amount_kopecks,
    created_at: fine.created_at,
  });
}

/**
 * HTML для друку через expo-print → Android Print Service. Налаштовано під
 * 57 мм паперу (≈ 220 пунктів × N) з моноспейс шрифтом.
 */
export function buildReceiptHtml(fine: Fine, qrSvg: string): string {
  const text = buildReceiptText(fine).replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: 57mm auto; margin: 4mm; }
  body { font-family: 'Courier New', Menlo, monospace; font-size: 10pt; line-height: 1.25; color: #000; margin: 0; padding: 0; width: 49mm; }
  .qr { text-align: center; margin-top: 6pt; }
  .qr svg { width: 36mm; height: 36mm; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style></head><body>
<pre>${text}</pre>
<div class="qr">${qrSvg}</div>
</body></html>`;
}
