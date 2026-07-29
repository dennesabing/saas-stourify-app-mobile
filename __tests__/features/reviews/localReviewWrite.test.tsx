import { render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import type Review from '@/db/models/Review'
import { createLocalReview } from '@/features/reviews/api/createLocalReview'
import { useSpotReviews } from '@/features/reviews/hooks/useSpotReviews'
import { listPendingQueue } from '@/sync/queue'
import { createTestDatabase, markSynced } from '../../support/testDatabase'
import { TestProviders } from '../../support/TestProviders'

/** Renders whatever `useSpotReviews` currently observes for one spot, as text jest can assert on. */
function ReviewsProbe({ spotUuid }: { spotUuid: string }) {
  const rows = useSpotReviews(spotUuid)
  return (
    <Text testID="probe">
      {rows.map((row) => `${row.id}:${row.rating}:${row.isQueued ? 'queued' : 'synced'}`).join(',')}
    </Text>
  )
}

it('writes the review straight to the local database and never to the network', async () => {
  const database = createTestDatabase()
  const fetchSpy = jest.fn()
  global.fetch = fetchSpy as unknown as typeof fetch

  const id = await createLocalReview(database, {
    spotId: null,
    spotUuid: 'spot-uuid-1',
    rating: 5,
    body: 'Beautiful sunrise.',
  })

  expect(await database.get<Review>('sto_reviews').query().fetchCount()).toBe(1)
  expect(fetchSpy).not.toHaveBeenCalled()

  const [review] = await database.get<Review>('sto_reviews').query().fetch()
  expect(review.id).toBe(id)
  expect(review.uuid).toBe(review.id)
  expect(review.rating).toBe(5)
  expect(review.body).toBe('Beautiful sunrise.')
  expect(review.spotUuid).toBe('spot-uuid-1')
  expect(review.isQueued).toBe(true)
})

it('appears in useSpotReviews for its own spot, and not for a different spot', async () => {
  const database = createTestDatabase()

  await createLocalReview(database, {
    spotId: null,
    spotUuid: 'spot-uuid-1',
    rating: 4,
    body: 'Good spot.',
  })

  render(
    <TestProviders database={database}>
      <ReviewsProbe spotUuid="spot-uuid-1" />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveTextContent(/queued/)
  })

  const other = render(
    <TestProviders database={database}>
      <ReviewsProbe spotUuid="spot-uuid-2" />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(other.getByTestId('probe')).toHaveTextContent('')
  })
})

it('reads as queued until markSynced, and clears after', async () => {
  const database = createTestDatabase()

  await createLocalReview(database, {
    spotId: null,
    spotUuid: 'spot-uuid-1',
    rating: 3,
    body: null,
  })

  render(
    <TestProviders database={database}>
      <ReviewsProbe spotUuid="spot-uuid-1" />
    </TestProviders>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveTextContent(/queued/)
  })

  const [review] = await database.get<Review>('sto_reviews').query().fetch()
  await markSynced(database, review)

  await waitFor(() => {
    expect(screen.getByTestId('probe')).toHaveTextContent(/synced/)
  })
})

it('appears in the M2c sync queue, proving it drains through the existing push spine', async () => {
  const database = createTestDatabase()

  await createLocalReview(database, {
    spotId: null,
    spotUuid: 'spot-uuid-1',
    rating: 5,
    body: 'Wired to the spine.',
  })

  const rows = await listPendingQueue(database)

  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    tableName: 'sto_reviews',
    op: 'created',
    title: 'New review · 5★',
  })
})
