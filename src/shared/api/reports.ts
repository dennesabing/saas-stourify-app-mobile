import { client } from './client'

/**
 * Reporting — `POST /api/v1/reports`.
 *
 * A report is anonymous to whoever it is about. `ReportResource` exposes
 * `reporter_uuid` only to moderators and to the reporter themselves, and
 * nothing in the app renders a "you were reported" state, because no endpoint
 * would tell it.
 *
 * Filing is idempotent per reporter and subject: reporting the same thing twice
 * answers 200 with the report that already exists instead of erroring or
 * stacking a second row. Read that as success.
 */

/**
 * What can be reported — the server's own short tokens, from `ReportableType`.
 *
 * These are deliberately *not* morph aliases or class names: a client never
 * sees `stourify_spot`, let alone a `Modules\…` FQCN. Send the token.
 */
export type ReportableType = 'spot' | 'post' | 'review' | 'user'

/** From `ReportReason`. The order here is the order the picker renders. */
export type ReportReason = 'spam' | 'inappropriate' | 'wrong_info' | 'harassment' | 'other'

/**
 * The reason rows, with the wording a person reads.
 *
 * Kept beside the type rather than inside the sheet so the wire values and the
 * labels cannot drift apart in two files.
 */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'wrong_info', label: 'Wrong information' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'other', label: 'Something else' },
]

/**
 * The one reason that needs an explanation.
 *
 * `ReportStoreRequest` makes `details` required when the reason is `other`, so
 * the form enforces the same rule locally. Letting the request go and rendering
 * the 422 would be a round trip to learn something the app already knew.
 */
export const REASON_REQUIRING_DETAILS: ReportReason = 'other'

export interface Report {
  uuid: string
  reason: ReportReason
  details: string | null
  status: string
  subject: { type: string | null; uuid: string | null } | null
  created_at: string | null
}

export interface FileReportInput {
  reportableType: ReportableType
  reportableUuid: string
  reason: ReportReason
  /** Required when `reason` is `other`; ignored by the server otherwise. */
  details?: string
}

/**
 * File a report.
 *
 * Resolves on both 201 (new) and 200 (already reported) — the distinction is
 * the server's bookkeeping and not something a person filing a report needs to
 * be told about.
 */
export async function fileReport(input: FileReportInput): Promise<Report> {
  const res = await client.post('/reports', {
    reportable_type: input.reportableType,
    reportable_uuid: input.reportableUuid,
    reason: input.reason,
    ...(input.details !== undefined && input.details !== '' ? { details: input.details } : {}),
  })
  return res.data.data
}
