import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { Button, Input, Sheet, SheetOption, Text } from '@/shared/components/ui'
import { extractApiError } from '@/shared/api/client'
import {
  REASON_REQUIRING_DETAILS,
  REPORT_REASONS,
  fileReport,
  type ReportReason,
  type ReportableType,
} from '@/shared/api/reports'
import { useTheme } from '@/theme/ThemeProvider'

interface Props {
  visible: boolean
  onClose: () => void
  /** `post` for content, `user` for a person. Also accepts `spot` / `review`. */
  reportableType: ReportableType
  reportableUuid: string
}

/**
 * The report form — one sheet, every reportable thing.
 *
 * The same form serves a post and a person because the server's contract is the
 * same for both: a token, a uuid, a reason, and sometimes a description. Two
 * sheets would be two places to keep the reason list in step with
 * `ReportReason`.
 *
 * **Two server rules are enforced here rather than discovered from a response.**
 *
 * 1. `details` is required when the reason is "other". `ReportStoreRequest` says
 *    so, and a report with no explanation is not actionable by a moderator — but
 *    letting the request go and rendering the 422 makes a person wait to be told
 *    a rule the app already knows. So the sheet refuses locally, in its own
 *    words.
 * 2. Filing is idempotent per reporter and subject: a second report of the same
 *    thing answers **200** with the row that already exists. This sheet treats
 *    that exactly like a fresh 201, because from where the reporter is standing
 *    it is the same event — they told us about this, and we have it.
 *
 * Nothing here tells the reported party anything, and nothing can: no endpoint
 * would carry it, and `ReportResource` withholds `reporter_uuid` from everyone
 * but moderators and the reporter.
 */
export default function ReportSheet({ visible, onClose, reportableType, reportableUuid }: Props) {
  const theme = useTheme()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [filed, setFiled] = useState(false)

  // A sheet is mounted for the life of its screen and only toggled, so a second
  // report from the same screen would otherwise open onto the first one's
  // "Thank you" and its filled-in reason.
  useEffect(() => {
    if (!visible) {
      setReason(null)
      setDetails('')
      setLocalError(null)
      setFiled(false)
    }
  }, [visible])

  const mutation = useMutation({
    mutationFn: () =>
      fileReport({
        reportableType,
        reportableUuid,
        reason: reason as ReportReason,
        details: details.trim() === '' ? undefined : details.trim(),
      }),
    onSuccess: () => setFiled(true),
  })

  function submit(): void {
    setLocalError(null)

    if (reason === null) {
      setLocalError('Please choose a reason.')
      return
    }

    if (reason === REASON_REQUIRING_DETAILS && details.trim() === '') {
      // Deliberately not the field's own label wording. Two identical strings on
      // one screen — the label and the error — read as a rendering glitch rather
      // than as an instruction.
      setLocalError('Please add a description for this reason.')
      return
    }

    mutation.mutate()
  }

  const subject = reportableType === 'user' ? 'this explorer' : `this ${reportableType}`

  if (filed) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Thank you">
        <Text variant="body" color="muted">
          Our team will take a look. We will not tell them who reported it.
        </Text>
        <Button label="Done" onPress={onClose} />
      </Sheet>
    )
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Report ${subject}`}
      subtitle="Tell us what is wrong. Reports are anonymous — they will not be told who reported them."
    >
      <View style={{ gap: theme.spacing[2] }}>
        {REPORT_REASONS.map((option) => (
          <SheetOption
            key={option.value}
            label={option.label}
            selected={reason === option.value}
            onPress={() => {
              setReason(option.value)
              setLocalError(null)
            }}
          />
        ))}
      </View>

      {/* Always present, not revealed by picking "other": a field that appears
          under your finger moves the button you were about to press. The label
          is what changes, so the requirement is still obvious. */}
      <Input
        testID="report-details"
        label={
          reason === REASON_REQUIRING_DETAILS
            ? 'Describe the problem (required)'
            : 'Anything else we should know? (optional)'
        }
        placeholder="What happened?"
        value={details}
        onChangeText={(text) => {
          setDetails(text)
          setLocalError(null)
        }}
        multiline
      />

      {localError !== null ? (
        <Text variant="caption" color="danger">
          {localError}
        </Text>
      ) : null}

      {mutation.isError ? (
        <Text variant="caption" color="danger">
          {extractApiError(mutation.error)}
        </Text>
      ) : null}

      <Button
        label="Submit report"
        accessibilityLabel="Submit report"
        onPress={submit}
        loading={mutation.isPending}
      />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  )
}
