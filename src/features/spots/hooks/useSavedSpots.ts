import { useEffect, useMemo, useRef, useState } from 'react'
import { Q, type Database } from '@nozbe/watermelondb'
import { useDatabase } from '@nozbe/watermelondb/react'
import { useQuery } from '@tanstack/react-query'
import type Spot from '@/db/models/Spot'
import type WishlistItem from '@/db/models/WishlistItem'
import { thumbFor } from '@/features/discover/api/exploreSpots'
import {
  WISHLIST_QUERY_KEY,
  getWishlist,
  type WishlistItem as ServerSave,
} from '@/shared/api/wishlist'

/** What a Saved row draws about a spot, whichever place it was read from. */
export interface SavedSpotSummary {
  uuid: string
  title: string
  categories: string[]
  address: string | null
  thumbUrl: string | null
}

/** One line of the Saved list. */
export interface SavedSpot {
  /** Unique within the list: the save's own uuid. */
  key: string
  /** `null` when nothing can name the spot — see `isPending`. */
  spot: SavedSpotSummary | null
  /** Still on the phone, waiting for the sync to send it. */
  isQueued: boolean
  /**
   * A save only this phone knows about, of a spot nothing on the phone can
   * name — one made before saves kept a copy of their spot. Drawn as a plain
   * placeholder rather than as "no longer available", which would be false.
   */
  isPending: boolean
}

/**
 * Why the list may be short: the server's part of it is not in hand. `null`
 * when it is, or when there is nothing on screen to qualify.
 */
export type SavedSpotsRest = 'loading' | 'offline' | 'failed' | null

/** A save as this phone holds it, read into plain values. */
interface LocalSave {
  id: string
  spotUuid: string | null
  isQueued: boolean
  createdAt: number
  summary: SavedSpotSummary | null
  /** Whether the summary came from the copy kept at save time. */
  hasSnapshot: boolean
}

/**
 * Every wishlist row on the phone, with a summary of its spot where one can be
 * had: the copy kept at save time first, then the phone's own spot row (your
 * own spots are synced down), then nothing.
 */
async function readLocalSaves(database: Database): Promise<LocalSave[]> {
  const rows = await database.get<WishlistItem>('sto_wishlist_items').query().fetch()

  const unnamed = rows
    .filter((row) => row.spotSnapshot === null && row.spotUuid !== null)
    .map((row) => row.spotUuid as string)
  const spots =
    unnamed.length > 0
      ? await database
          .get<Spot>('sto_spots')
          .query(Q.where('uuid', Q.oneOf(unnamed)))
          .fetch()
      : []
  const spotByUuid = new Map(spots.map((spot) => [spot.uuid, spot]))

  return rows.map((row) => {
    const snapshot = row.spotSnapshot
    const localSpot = row.spotUuid ? spotByUuid.get(row.spotUuid) : undefined

    const summary: SavedSpotSummary | null = snapshot
      ? {
          uuid: snapshot.uuid,
          title: snapshot.title,
          categories: snapshot.categories,
          address: snapshot.address,
          thumbUrl: snapshot.thumb_url,
        }
      : localSpot
        ? {
            uuid: localSpot.uuid,
            title: localSpot.title,
            categories: localSpot.categories,
            address: localSpot.address,
            thumbUrl: localSpot.coverPhotoUrl,
          }
        : null

    return {
      id: row.id,
      spotUuid: row.spotUuid,
      isQueued: row.isQueued,
      createdAt: row.createdAt,
      summary,
      hasSnapshot: snapshot !== null,
    }
  })
}

/**
 * The server's list with the phone's saves laid on top, matched by spot so a
 * save is one line whichever side has it. The server's copy wins where both
 * do: once it is there, the save has been sent.
 *
 * A phone save is added when it is still waiting to send, or when it carries a
 * copy of its spot and the server's list does not show it yet. The second
 * covers the moment between "sent" and "the list fetched again" — without it
 * the row would drop out and come back. Rows the pull brought down carry no
 * copy and are already sent, so they are the server's to report and are never
 * added here.
 */
export function mergeSavedSpots(
  allServer: ServerSave[],
  local: LocalSave[],
  removed: ReadonlySet<string> = new Set(),
): SavedSpot[] {
  // A save you removed stays off the list even while the server still reports
  // it — its removal is queued on the phone and has not been sent yet
  // (STOURIFY-303). The phone's own rows need no filter: a row marked for
  // removal is invisible to every query.
  const server = allServer.filter((save) => !removed.has(save.uuid))

  const onServerBySpot = new Set(
    server.map((save) => save.spot?.uuid).filter((uuid): uuid is string => Boolean(uuid)),
  )
  const onServerBySave = new Set(server.map((save) => save.uuid))

  const phoneOnly = local
    .filter((save) => save.isQueued || save.hasSnapshot)
    .filter((save) => !onServerBySave.has(save.id))
    .filter((save) => save.spotUuid === null || !onServerBySpot.has(save.spotUuid))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map<SavedSpot>((save) => ({
      key: save.id,
      spot: save.summary,
      isQueued: save.isQueued,
      isPending: save.summary === null,
    }))

  const fromServer = server.map<SavedSpot>((save) => ({
    key: save.uuid,
    spot: save.spot
      ? {
          uuid: save.spot.uuid,
          title: save.spot.title,
          categories: save.spot.categories ?? [],
          address: save.spot.address ?? null,
          thumbUrl: thumbFor(save.spot),
        }
      : null,
    isQueued: false,
    isPending: false,
  }))

  // Newest first on both sides, and a save still on the phone is newer than
  // anything the server has reported.
  return [...phoneOnly, ...fromServer]
}

/**
 * The spots this explorer has saved: the server's list, plus the saves this
 * phone is still holding (STOURIFY-207).
 *
 * Saved spots reads the server on purpose — `shared/api/wishlist.ts` says why
 * — but saving is a local write the sync sends later. For the couple of
 * minutes in between, the save existed only where the list did not look, and
 * the list said "Nothing saved yet" while the spot page showed the save with
 * its queued mark. The two screens read different places; this makes the list
 * read both.
 *
 * `enabled` gates the request and the local read together, for a caller like
 * the profile tab that only lists saves while it is showing them.
 */
export function useSavedSpots({ enabled = true }: { enabled?: boolean } = {}) {
  const database = useDatabase()
  const query = useQuery({
    queryKey: WISHLIST_QUERY_KEY,
    queryFn: getWishlist,
    enabled,
  })

  const [local, setLocal] = useState<LocalSave[]>([])
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const [isLocalRead, setIsLocalRead] = useState(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    // `withChangesForTables`, as in `useIsSpotSaved`: the sync marking a save
    // sent flips `_status` without touching a column, which a column-keyed
    // observer would never see. `sto_spots` too, so a pulled spot can name a
    // save that had nothing to name it with.
    //
    // The saves marked for removal are read alongside (STOURIFY-303). Once the
    // server acknowledges one, its mark is destroyed without a change event, so
    // this set can hold a uuid a little longer than the phone does — which only
    // keeps hiding a save that is gone anyway.
    const subscription = database
      .withChangesForTables(['sto_wishlist_items', 'sto_spots'])
      .subscribe(() => {
        void Promise.all([
          readLocalSaves(database),
          database.adapter.getDeletedRecords('sto_wishlist_items'),
        ]).then(([saves, removedIds]) => {
          if (cancelled) return
          setLocal(saves)
          setRemoved(new Set(removedIds))
          setIsLocalRead(true)
        })
      })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [database, enabled])

  /**
   * When a save finishes sending, ask the server again, so its copy takes
   * over from the phone's promptly rather than on the next visit.
   */
  const { refetch } = query
  const queuedIds = local
    .filter((save) => save.isQueued)
    .map((save) => save.id)
    .sort()
    .join('\n')
  const lastQueued = useRef<string | null>(null)

  useEffect(() => {
    const before = lastQueued.current
    lastQueued.current = queuedIds
    if (!enabled || before === null || before === '') return

    const now = new Set(queuedIds.split('\n'))
    if (before.split('\n').some((id) => !now.has(id))) void refetch()
  }, [enabled, queuedIds, refetch])

  const items = useMemo(
    () => mergeSavedSpots(query.data ?? [], local, removed),
    [query.data, local, removed],
  )

  const rest: SavedSpotsRest =
    items.length === 0 || query.data !== undefined
      ? null
      : query.isError
        ? 'failed'
        : query.fetchStatus === 'paused'
          ? 'offline'
          : 'loading'

  return {
    items,
    rest,
    /** Nothing to show yet because a source has not answered. */
    isPending: query.isPending || !isLocalRead,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    isRefetching: query.isRefetching,
  }
}
