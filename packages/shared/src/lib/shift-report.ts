import type { Fine } from '../data/fines-api';
import type { ControllerCall } from '../data/support-api';
import type { ValidationLogEntry } from '../data/validation-log';
import { FINE_REASON_LABELS } from '../data/fines-api';

/**
 * Текстовий звіт за зміну (для Share sheet — email/мессенджер/SMS).
 * Включає підсумок і CSV-таблиці сканів та постанов.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function formatHryvnia(kopecks: number): string {
  const major = Math.floor(kopecks / 100);
  const minor = Math.abs(kopecks % 100);
  return `${major}.${pad(minor)} грн`;
}

export interface ShiftReportInput {
  controllerSerial: string;
  controllerName?: string | null;
  windowStartMs: number;
  windowEndMs: number;
  scans: ValidationLogEntry[];
  fines: Fine[];
  /**
   * Виклики водіїв, які ще в роботі на момент звіту (pending + accepted).
   * Незакритий виклик — це незавершена робота, і в звіті вона має бути видно
   * одразу, а не губитись між сканами.
   */
  activeCalls?: ControllerCall[];
}

const CALL_STATUS_LABELS: Record<string, string> = {
  pending: 'очікує прийняття',
  accepted: 'прийнято, в роботі',
  completed: 'завершено',
  cancelled: 'скасовано водієм',
};

function formatIsoDate(iso: string | null): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? '—' : formatDate(ts);
}

export function buildShiftReport(input: ShiftReportInput): string {
  const totalScans = input.scans.length;
  const validScans = input.scans.filter((s) => s.result === 'valid').length;
  const invalidScans = totalScans - validScans;
  const totalFinesAmount = input.fines.reduce((acc, f) => acc + f.fine_amount_kopecks, 0);

  const activeCalls = input.activeCalls ?? [];

  const lines: string[] = [];
  lines.push('ЗВІТ ЗА ЗМІНУ КОНТРОЛЕРА');
  lines.push('═'.repeat(40));
  lines.push(`Контролер: ${input.controllerName ?? '—'} (${input.controllerSerial})`);
  lines.push(`Період:    ${formatDate(input.windowStartMs)} — ${formatDate(input.windowEndMs)}`);
  lines.push('');
  lines.push('ПІДСУМОК');
  lines.push('─'.repeat(40));
  lines.push(`Перевірено квитків:  ${totalScans}`);
  lines.push(`  валідних:          ${validScans}`);
  lines.push(`  невалідних:        ${invalidScans}`);
  lines.push(`Видано постанов:     ${input.fines.length}`);
  lines.push(`Загальна сума:       ${formatHryvnia(totalFinesAmount)}`);
  lines.push(`Активних викликів:   ${activeCalls.length}`);
  lines.push('');

  if (activeCalls.length > 0) {
    lines.push('АКТИВНІ ВИКЛИКИ ВОДІЇВ');
    lines.push('─'.repeat(40));
    for (const call of activeCalls) {
      const route = call.routeId ? `маршрут ${call.routeId}` : 'маршрут не вказано';
      const status = CALL_STATUS_LABELS[call.status] ?? call.status;
      lines.push(`• ${route} — ${status}`);
      lines.push(
        `  водій: ${call.driverDisplayName ?? "ім'я не вказано"} (${call.driverSerial})` +
          (call.driverPhone ? `, тел. ${call.driverPhone}` : ''),
      );
      lines.push(
        `  створено: ${formatIsoDate(call.createdAt)}` +
          (call.acceptedAt ? ` · прийнято: ${formatIsoDate(call.acceptedAt)}` : ''),
      );
    }
    lines.push('');
  }

  if (input.scans.length > 0) {
    lines.push('СКАНУВАННЯ (CSV)');
    lines.push('─'.repeat(40));
    lines.push('час,ticket_id,результат,причина,маршрут');
    for (const s of input.scans) {
      lines.push(
        `${formatDate(s.scanned_at)},${s.ticket_id},${s.result},${s.reason ?? ''},${s.route_id ?? ''}`,
      );
    }
    lines.push('');
  }

  if (input.fines.length > 0) {
    lines.push('ПОСТАНОВИ (CSV)');
    lines.push('─'.repeat(40));
    lines.push('час,id,ПІБ,документ,причина,сума_грн,маршрут');
    for (const f of input.fines) {
      lines.push(
        [
          formatDate(f.created_at),
          f.id,
          `"${f.offender_name.replace(/"/g, '""')}"`,
          `${f.doc_type} ${f.doc_number}`,
          FINE_REASON_LABELS[f.reason],
          (f.fine_amount_kopecks / 100).toFixed(2),
          f.route_id ?? '',
        ].join(','),
      );
    }
    lines.push('');
  }

  lines.push('═'.repeat(40));
  lines.push('Згенеровано transport-controller');
  return lines.join('\n');
}
