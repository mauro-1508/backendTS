import { z } from 'zod';
import { REFERENCE_TYPES, USAGE_EVENT_TYPES, USAGE_SECTIONS } from '../../../../domain/entity';

export const recordEventBodySchema = z
  .object({
    section: z.enum(USAGE_SECTIONS),
    eventType: z.enum(USAGE_EVENT_TYPES),
    referenceType: z.enum(REFERENCE_TYPES).optional(),
    referenceId: z.number().int().positive().max(2147483647).optional(),
  })
  .refine((b) => (b.referenceType === undefined) === (b.referenceId === undefined), {
    message: 'referenceType y referenceId van juntos',
  });

const isoDateOrDatetime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const sectionReportQuerySchema = z.object({
  from: isoDateOrDatetime.optional(),
  to: isoDateOrDatetime.optional(),
});
