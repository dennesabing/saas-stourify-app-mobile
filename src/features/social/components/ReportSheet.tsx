import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { Button, Icon, Input, Sheet, Text } from '@/shared/components/ui'
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
 * Dressed as the Settings design's artboard 5, "Report content" (STOURIFY-291):
 * the reasons as radio rows, an optional details box, then a "Report received"
 * confirmation. The canvas draws it as a full screen; it stays a sheet here
 * because it is opened from the ⋯ menus on posts and profiles, and a full screen
 * would change the flow for every caller. What a report sends did not change.
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
 * but moderators and the reporter. That is what makes the sheet's "Your report
 * is anonymous." true, and it is the condition for keeping it.
 */
export default function ReportSheet({ visible, onClose, reportableType, reportableUuid }: Props) {
  const theme = useTheme()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [filed, setFiled] = useState(false)

  // A sheet is mounted for the life of its screen and only toggled, so a second
  // report from the same screen would otherwise open onto the first one's
  // confirmation and its filled-in reason.
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

    // Unreachable through the button, which stays disabled until a reason is
    // picked; kept because a guard that costs nothing outlives a style change.
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

  if (filed) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <View style={{ alignItems: 'center', gap: theme.spacing[2], paddingTop: 6 }}>
          {/* The design's 66-point success disc: `success` on its own 14% tint,
              the pair Forgot password's "Check your inbox" already uses. */}
          <View
            style={{
              width: 66,
              height: 66,
              borderRadius: 33,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.successBg,
              marginBottom: 6,
            }}
          >
            <Icon name="check" size={32} color="success" strokeWidth={2.4} />
          </View>
          <Text
            variant="h2"
            style={{ fontFamily: theme.fontFamily.displayBold, fontSize: 20, textAlign: 'center' }}
          >
            Report received
          </Text>
          <Text variant="body" color="muted" style={{ textAlign: 'center' }}>
            Thanks for helping keep Stourify safe. Our team will review it shortly.
          </Text>
        </View>
        <Button label="Done" accessibilityLabel="Done" size="lg" fullWidth onPress={onClose} />
      </Sheet>
    )
  }

  const needsDetails = reason === REASON_REQUIRING_DETAILS

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Report content"
      subtitle="Why are you reporting this? Your report is anonymous."
    >
      <View accessibilityRole="radiogroup" style={{ gap: 9 }}>
        {REPORT_REASONS.map((option) => (
          <ReasonRow
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
      <View style={{ gap: theme.spacing[2] }}>
        <Text variant="micro" color="muted" style={{ fontSize: 12, letterSpacing: 0.4 }}>
          {needsDetails ? 'Add details (required)' : 'Add details (optional)'}
        </Text>
        <Input
          testID="report-details"
          placeholder="Tell us more so we can act faster…"
          value={details}
          onChangeText={(text) => {
            setDetails(text)
            setLocalError(null)
          }}
          multiline
        />
      </View>

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
        size="lg"
        fullWidth
        onPress={submit}
        disabled={reason === null}
        loading={mutation.isPending}
      />
      <Button label="Cancel" variant="ghost" fullWidth onPress={onClose} />
    </Sheet>
  )
}

interface ReasonRowProps {
  label: string
  selected: boolean
  onPress: () => void
}

/**
 * One reason — the design's `.reason`: a bordered row with a radio mark.
 *
 * A radio rather than `SheetOption`'s check, because the design draws one and
 * because it says "pick one of these" before anything is picked. The mark is a
 * filled disc with a dot, not colour alone, so the chosen row reads in either
 * theme and to a screen reader (`checked`).
 */
function ReasonRow({ label, selected, onPress }: ReasonRowProps) {
  const theme = useTheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: theme.minTouchTarget,
        paddingVertical: 14,
        paddingHorizontal: 15,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.primary : theme.colors.hairline,
        backgroundColor: selected ? theme.colors.badgeBg : theme.colors.card,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? theme.colors.primary : theme.colors.hairline,
          backgroundColor: selected ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.onButton,
            }}
          />
        ) : null}
      </View>

      <Text variant="body" style={{ flex: 1, fontFamily: theme.fontFamily.bodyMedium }}>
        {label}
      </Text>
    </Pressable>
  )
}
