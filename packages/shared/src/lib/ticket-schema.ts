import { z } from 'zod';
import { TicketFareType, TicketStatus } from '../types/ticket';

/**
 * Zod-схеми для runtime-валідації відповідей бекенда. Структура повністю
 * відповідає `class Ticket(Base)` з docx; ISO-8601 рядки для дат.
 */

export const ticketStatusSchema = z.nativeEnum(TicketStatus);
export const ticketFareTypeSchema = z.nativeEnum(TicketFareType);
export const validationMethodSchema = z.enum(['qr', 'ble', 'nfc']);

export const ticketSchema = z.object({
  id: z.string().min(1).max(16),
  order_id: z.string().min(1),
  user_id: z.string().min(1).max(36),
  transport: z.string().min(1),
  price: z.number().int().nonnegative(),
  status: ticketStatusSchema,
  fare_type: ticketFareTypeSchema,
  created_at: z.string(),
  use_by_days: z.number().int().positive(),
  validated_at: z.string().nullable(),
  active_until: z.string().nullable(),
  validated_serial_number: z.string().max(32).nullable(),
  validated_door_number: z.number().int().nullable(),
  validation_method: validationMethodSchema.nullable(),
  validation_card_hash: z.string().max(64).nullable(),
  department_id: z.string().max(36).nullable(),
});

export const routeActivityEntrySchema = z.object({
  id: z.string(),
  validated_at: z.string(),
  transport: z.string(),
  fare_type: ticketFareTypeSchema,
  price: z.number().int().nonnegative(),
  validated_door_number: z.number().int().nullable(),
  validation_method: validationMethodSchema.nullable(),
});

export const routeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  transport: z.string(),
});

export const sessionSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  role: z.enum(['user', 'inspector', 'driver', 'admin', 'superadmin']),
  serial_number: z.string(),
  assigned_route_id: z.string().nullable(),
  assigned_vehicle_number: z.string().nullable().default(null),
});
