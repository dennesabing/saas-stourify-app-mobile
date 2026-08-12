import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ProfileStackParamList } from '@/shared/navigation/types'
import {
  getMyProfile,
  updateMyProfile,
  type ExplorerProfile,
  type ProfileWrite,
} from '@/shared/api/profiles'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { useCities } from '@/features/onboarding/hooks/useCities'
import { INTEREST_OPTIONS } from '@/shared/constants/interests'
import { Button, Chip, Input, Skeleton, Text } from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

/**
 * Editing the explorer identity — username, bio, website, home city, interests.
 *
 * **This screen used to save to an address that did not exist** (STOURIFY-38).
 * It posted `PUT /user/profile`, which no route file in the project declares,
 * so every save answered 404. Worse, the form collected the wrong two fields:
 * `name` is the platform account's display name (written at `PUT /me`) and only
 * `bio` belonged here at all, which left the whole explorer identity — the very
 * thing the profile header renders — uneditable once onboarding was over.
 *
 * The real endpoint is `PATCH /profile`, and it is an **upsert**: the same call
 * creates a profile for someone who skipped onboarding and edits one that
 * already exists. That is why the profile header's "Set up profile" button can
 * route straight here with no separate create screen.
 *
 * **Saving needs a connection, which is unusual for this app.** Onboarding
 * writes this same table straight into WatermelonDB and lets the sync queue
 * push it, so those steps work offline. This screen deliberately does not,
 * because a username has to be unique across the whole platform and only the
 * server knows that. Written locally, a taken username would look saved and
 * then fail inside a background push with nowhere to show the error — leaving
 * someone with a username they do not actually have. The local row catches up
 * on the next sync delta; this screen does not write it directly, because two
 * writers on one row is a conflict the sync engine has no reason to expect.
 *
 * Only changed fields are sent. `username` is `sometimes` on an established
 * profile precisely so a bio edit need not restate the handle — restating it
 * would let an unrelated uniqueness failure block a save that never touched it.
 */
export default function EditProfileScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const cities = useCities()

  const { data: profile, isFetching, isSuccess } = useQuery({
    // The SAME key `ProfileScreen` reads its own profile under, deliberately.
    // The first version of this screen invented `['profile','me']`, and the
    // consequence only showed up on a device: the save reached the server, the
    // screen went back, and the header underneath still showed the old bio,
    // because the entry this screen dropped was one nothing else had ever
    // written. Sharing the key also means opening this screen from the profile
    // header is instant — the answer is already cached.
    queryKey: ['explorer-profile', 'me'],
    // `null` is an ordinary answer here, not a failure: it means registered but
    // no profile yet. The form renders empty and the first save creates it.
    queryFn: getMyProfile,
  })

  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [homeCityUuid, setHomeCityUuid] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [loaded, setLoaded] = useState<ExplorerProfile | null>(null)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // Seeded once, and only from a **settled** read — `isFetching` false, not
  // merely "some data exists".
  //
  // The app keeps React Query's cache on disk between launches, so on open
  // there is almost always an answer available instantly: the one from last
  // time. Seeding a form from that fills the fields with values the server may
  // have moved past, and the user then saves them back — quietly undoing their
  // own last edit. Waiting for the refetch costs a skeleton for a moment and
  // buys a form that is never a copy of the past.
  //
  // Once, and no more: re-seeding on every render of `profile` would wipe out
  // whatever the user is typing the instant a background refetch returned.
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (seeded || isFetching || !isSuccess) return

    setUsername(profile?.username ?? '')
    setBio(profile?.bio ?? '')
    setWebsite(profile?.website ?? '')
    setHomeCityUuid(profile?.home_city?.uuid ?? null)
    setInterests(profile?.interests ?? [])
    setLoaded(profile ?? null)
    setSeeded(true)
  }, [profile, isFetching, isSuccess, seeded])

  const mutation = useMutation({
    mutationFn: (changes: ProfileWrite) => updateMyProfile(changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['explorer-profile', 'me'] })
      navigation.goBack()
    },
    onError: (error: unknown) => {
      const errors = extractValidationErrors(error)
      setFieldErrors(errors)
      // A 422 already explains itself field by field; anything else (offline,
      // a 500) has only the one message, and silence there reads as a save
      // that quietly did nothing.
      setFormError(Object.keys(errors).length > 0 ? '' : extractApiError(error))
    },
  })

  /**
   * Only what actually changed.
   *
   * Compared against the profile as it was read, so re-opening the screen and
   * pressing Save without touching anything sends `{}` rather than re-asserting
   * every field.
   */
  function changedFields(): ProfileWrite {
    const changes: ProfileWrite = {}

    if (username.trim() !== (loaded?.username ?? '')) changes.username = username.trim()
    if (bio !== (loaded?.bio ?? '')) changes.bio = bio === '' ? null : bio
    if (website.trim() !== (loaded?.website ?? '')) {
      changes.website = website.trim() === '' ? null : website.trim()
    }
    if (homeCityUuid !== (loaded?.home_city?.uuid ?? null)) changes.home_city_uuid = homeCityUuid
    if (!sameMembers(interests, loaded?.interests ?? [])) changes.interests = interests

    return changes
  }

  function save(): void {
    setFormError('')
    setFieldErrors({})
    mutation.mutate(changedFields())
  }

  /**
   * Editing a field drops that field's error.
   *
   * Seen on the emulator: after "That username is taken." the message sat under
   * the box while the user typed a different name, still saying the new one was
   * taken. It is a statement about a value that is no longer in the field, and
   * leaving it there reads as the app not noticing the fix. Only that field's
   * message goes — the others still apply.
   */
  function clearFieldError(field: string): void {
    setFieldErrors((prev) => (field in prev ? omit(prev, field) : prev))
  }

  function toggleInterest(interest: string): void {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest],
    )
  }

  // The form does not exist until the read has landed and seeded it. Rendering
  // the inputs first and filling them in afterwards looks harmless and is not:
  // anything typed in that gap is silently overwritten the moment the profile
  // arrives, which is the worst kind of lost edit because nothing reports it.
  if (!seeded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
        <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
          <Skeleton height={32} />
          <Skeleton height={56} />
          <Skeleton height={96} />
          <Skeleton height={56} />
        </View>
      </SafeAreaView>
    )
  }

  // An interest the server already holds is shown even when it is not one of
  // the current options — the endpoint accepts any string, and hiding one would
  // silently drop it on the next save.
  const interestChoices = [...new Set([...INTEREST_OPTIONS, ...interests])]

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: theme.gutter, gap: theme.spacing[5] }}>
        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="h1">{loaded === null ? 'Set up your profile' : 'Edit profile'}</Text>
          <Text variant="body" color="muted">
            This is what other explorers see. Your login name and email live in Settings.
          </Text>
        </View>

        <Input
          testID="edit-profile-username"
          label="USERNAME"
          placeholder="lowercase, numbers, dots and underscores"
          value={username}
          onChangeText={(text) => {
            setUsername(text)
            clearFieldError('username')
          }}
          autoCapitalize="none"
          error={firstError(fieldErrors, 'username')}
        />

        <Input
          testID="edit-profile-bio"
          label="BIO"
          placeholder="A line or two about how you explore."
          value={bio}
          onChangeText={(text) => {
            setBio(text)
            clearFieldError('bio')
          }}
          multiline
          error={firstError(fieldErrors, 'bio')}
        />

        <Input
          testID="edit-profile-website"
          label="WEBSITE"
          placeholder="https://"
          value={website}
          onChangeText={(text) => {
            setWebsite(text)
            clearFieldError('website')
          }}
          autoCapitalize="none"
          error={firstError(fieldErrors, 'website')}
        />

        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="caption" color="muted">
            HOME CITY
          </Text>

          {cities.length === 0 ? (
            <Text variant="body" color="muted">
              Your cities are still syncing — this only takes a moment on a first launch.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
              {cities.map((city) => (
                <Chip
                  key={city.uuid}
                  label={city.name}
                  selected={homeCityUuid === city.uuid}
                  // Tapping the selected city clears it — there is no other way
                  // to go back to having no home city once one is picked.
                  onPress={() => setHomeCityUuid(homeCityUuid === city.uuid ? null : city.uuid)}
                />
              ))}
            </View>
          )}

          {firstError(fieldErrors, 'home_city_uuid') ? (
            <Text variant="caption" color="danger">
              {firstError(fieldErrors, 'home_city_uuid')}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing[2] }}>
          <Text variant="caption" color="muted">
            INTERESTS
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing[2] }}>
            {interestChoices.map((interest) => (
              <Chip
                key={interest}
                label={interest}
                selected={interests.includes(interest)}
                onPress={() => toggleInterest(interest)}
              />
            ))}
          </View>

          {firstError(fieldErrors, 'interests') ? (
            <Text variant="caption" color="danger">
              {firstError(fieldErrors, 'interests')}
            </Text>
          ) : null}
        </View>

        {formError ? (
          <Text variant="body" color="danger">
            {formError}
          </Text>
        ) : null}

        <View style={{ gap: theme.spacing[3] }}>
          <Button
            label="Save changes"
            onPress={save}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            fullWidth
          />
          <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} fullWidth />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/** The server sends an array per field; the field shows the first message. */
function firstError(errors: Record<string, string[]>, field: string): string | undefined {
  return errors[field]?.[0]
}

function omit(errors: Record<string, string[]>, field: string): Record<string, string[]> {
  const { [field]: _removed, ...rest } = errors
  return rest
}

/** Order-insensitive — reordering chips is not an edit worth sending. */
function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')
}
