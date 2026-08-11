import { useEffect, useState } from 'react'
import { Sheet, SheetOption } from '@/shared/components/ui'
import ReportSheet from './ReportSheet'

interface Props {
  /** The post whose menu is open, or `null` for closed. */
  postUuid: string | null
  onClose: () => void
}

/**
 * The overflow menu for a post — Report, today.
 *
 * One component, rendered once per screen and pointed at whichever post's
 * control was tapped. A feed of a hundred rows must not mount a hundred modals,
 * so the row raises the tap and the screen holds the state; `postUuid` doubles
 * as the open/closed flag because a menu with no post is meaningless.
 *
 * A menu with one item looks like an indirection worth removing — tap `⋯` and
 * get the report form straight away. It is kept because the same `⋯` is where
 * "mute", "hide this post" and "copy link" go next, and because a person's tap
 * on an unlabelled glyph should show them their options rather than commit them
 * to the first one.
 */
export default function PostActionsSheet({ postUuid, onClose }: Props) {
  const [reporting, setReporting] = useState(false)

  // Closing the menu closes the form with it, so reopening from another row
  // does not land on the previous row's half-filled report.
  useEffect(() => {
    if (postUuid === null) setReporting(false)
  }, [postUuid])

  return (
    <>
      <Sheet visible={postUuid !== null && !reporting} onClose={onClose}>
        <SheetOption
          label="Report"
          icon="🚩"
          description="Tell our team about this post. The author will not know."
          onPress={() => setReporting(true)}
        />
      </Sheet>

      <ReportSheet
        visible={reporting && postUuid !== null}
        onClose={onClose}
        reportableType="post"
        reportableUuid={postUuid ?? ''}
      />
    </>
  )
}
