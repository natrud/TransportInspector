import { describe, expect, it } from 'vitest';
import { parseQrPayload } from './qr-parser';

describe('parseQrPayload', () => {
  describe('JSON формат', () => {
    it('парсить ticket_id + hash', () => {
      expect(parseQrPayload('{"ticket_id":"a1b2c3d4e5f6g7h8","hash":"abc123"}')).toEqual({
        ticket_id: 'a1b2c3d4e5f6g7h8',
        hash: 'abc123',
      });
    });

    it('приймає коротший ключ "id"', () => {
      expect(parseQrPayload('{"id":"abcdef123456","h":"deadbeef"}')).toEqual({
        ticket_id: 'abcdef123456',
        hash: 'deadbeef',
      });
    });

    it('приймає validation_card_hash як ключ хешу', () => {
      expect(parseQrPayload('{"ticket_id":"abc12345","validation_card_hash":"xyz"}')).toEqual({
        ticket_id: 'abc12345',
        hash: 'xyz',
      });
    });

    it('повертає null hash, якщо його немає', () => {
      expect(parseQrPayload('{"ticket_id":"abcdef12"}')).toEqual({
        ticket_id: 'abcdef12',
        hash: null,
      });
    });

    it('повертає null на malformed JSON', () => {
      expect(parseQrPayload('{"ticket_id":')).toBeNull();
    });

    it('повертає null, якщо ticket_id не string', () => {
      expect(parseQrPayload('{"ticket_id":42}')).toBeNull();
    });

    it('повертає null, якщо ticket_id порожній', () => {
      expect(parseQrPayload('{"ticket_id":""}')).toBeNull();
    });

    it('повертає null, якщо hash довший за 64 символи', () => {
      const longHash = 'a'.repeat(65);
      expect(parseQrPayload(`{"ticket_id":"abc12345","hash":"${longHash}"}`)).toBeNull();
    });
  });

  describe('id:hash формат', () => {
    it('парсить базовий id:hash', () => {
      expect(parseQrPayload('a1b2c3d4e5f6g7h8:deadbeef')).toEqual({
        ticket_id: 'a1b2c3d4e5f6g7h8',
        hash: 'deadbeef',
      });
    });

    it('повертає null hash для рядка з порожнім хешем', () => {
      expect(parseQrPayload('abcdef12:')).toEqual({
        ticket_id: 'abcdef12',
        hash: null,
      });
    });

    it('повертає null для трьох частин', () => {
      expect(parseQrPayload('a:b:c')).toBeNull();
    });

    it('повертає null, якщо ticket_id невалідний', () => {
      expect(parseQrPayload(':deadbeef')).toBeNull();
    });
  });

  describe('голий ticket_id', () => {
    it('приймає валідний UUID16', () => {
      expect(parseQrPayload('a1b2c3d4e5f6g7h8')).toEqual({
        ticket_id: 'a1b2c3d4e5f6g7h8',
        hash: null,
      });
    });

    it('повертає null для занадто короткого', () => {
      expect(parseQrPayload('abc')).toBeNull();
    });

    it('повертає null для занадто довгого', () => {
      expect(parseQrPayload('a'.repeat(20))).toBeNull();
    });

    it('повертає null для рядка з пробілами всередині', () => {
      expect(parseQrPayload('abc def')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('trimming пробілів', () => {
      expect(parseQrPayload('  abcdef12  ')).toEqual({
        ticket_id: 'abcdef12',
        hash: null,
      });
    });

    it('null/undefined → null', () => {
      expect(parseQrPayload(null)).toBeNull();
      expect(parseQrPayload(undefined)).toBeNull();
    });

    it('порожній рядок → null', () => {
      expect(parseQrPayload('')).toBeNull();
      expect(parseQrPayload('   ')).toBeNull();
    });
  });
});
