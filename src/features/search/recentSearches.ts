import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'stourify_recent_searches'

/** Newest-first, capped so the list stays a glance rather than a history. */
const MAX_RECENT = 8

async function readStored(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    // A corrupt or missing entry is "no recent searches yet", not a crash.
    return []
  }
}

/**
 * Recent searches on the Search screen (STOURIFY-259) — newest first,
 * de-duplicated case-insensitively, capped at `MAX_RECENT`, and persisted so
 * they survive an app restart.
 *
 * A query is recorded only when the reader commits to it — submitting from the
 * keyboard, or opening a result from it — never on every keystroke, so a word
 * typed and abandoned mid-search never shows up here.
 */
export function useRecentSearches() {
  const [queries, setQueries] = useState<string[]>([])

  /**
   * Guards against a real race: the disk read is async, and a reader can
   * submit a search (or hit Clear) before it resolves. Without this, the read
   * landing late would stomp whatever the user just did with whatever was on
   * disk a moment earlier. Once any write has happened, the in-memory state is
   * the truth and the pending read is discarded when it arrives.
   */
  const hasWrittenRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void readStored().then((stored) => {
      if (!cancelled && !hasWrittenRef.current) setQueries(stored)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const record = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return

    hasWrittenRef.current = true
    setQueries((prev) => {
      const deduped = prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())
      const next = [trimmed, ...deduped].slice(0, MAX_RECENT)
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const remove = useCallback((query: string) => {
    hasWrittenRef.current = true
    setQueries((prev) => {
      const next = prev.filter((q) => q !== query)
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const clear = useCallback(() => {
    hasWrittenRef.current = true
    setQueries([])
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]))
  }, [])

  return { queries, record, remove, clear }
}
