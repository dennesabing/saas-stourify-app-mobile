import { useEffect, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native'
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
import { removeAvatar, updateDisplayName, uploadAvatar } from '@/shared/api/account'
import { extractApiError, extractValidationErrors } from '@/shared/api/client'
import { pickAvatar } from '@/features/profile/api/pickAvatar'
import { useCities } from '@/features/onboarding/hooks/useCities'
import { INTEREST_OPTIONS } from '@/shared/constants/interests'
import { useIsOnline } from '@/shared/hooks/useIsOnline'
import { useAuthStore } from '@/shared/store/auth'
import {
  Avatar,
  BarHeader,
  Button,
  Chip,
  Icon,
  Input,
  Skeleton,
  Text,
} from '@/shared/components/ui'
import { useTheme } from '@/theme/ThemeProvider'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

/**
 * The server's own cap on a bio (`ProfileUpdateRequest`: `max:150`). The field
 * stops there and the counter counts towards it, so a long bio is never
 * refused after it has been written.
 */
const BIO_MAX = 150

/** The server's cap on a display name (`UserProfileController::update`: `max:255`). */
const NAME_MAX = 255

/**
 * Editing the explorer identity — photo, display name, username, bio, website,
 * home city, interests.
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
 * **Three endpoints, one screen** (STOURIFY-307). The photo and the display
 * name belong to the platform account, not to the explorer profile, so they
 * go to the account's own routes: the photo to `POST|DELETE /me/avatar` the
 * moment it is picked, the name to `PUT /me` when Save is pressed — and only
 * when it changed. Everything else goes to `PATCH /profile` as before. A
 * `name` sent to `PATCH /profile` is silently dropped, which is the older half
 * of the STOURIFY-38 bug.
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
 * Offline, Save and "Change photo" say so and send nothing, rather than
 * surfacing axios's raw "Network Error".
 *
 * Only changed fields are sent. `username` is `sometimes` on an established
 * profile precisely so a bio edit need not restate the handle — restating it
 * would let an unrelated uniqueness failure block a save that never touched it.
 *
 * **Laid out as artboard 2 of the Profile design** (STOURIFY-289): a back bar
 * with a text "Save", the avatar with its camera badge and "Change photo",
 * labelled fields, and "Save changes" pinned under the scroll. Home city stays
 * chips from the synced city list rather than the canvas's text box, because
 * the server stores a city, not a string.
 */
export default function EditProfileScreen({ navigation }: Props) {
  const theme = useTheme()
  const queryClient = useQueryClient()
  const cities = useCities()
  const online = useIsOnline()
  const { user: currentUser } = useAuthStore()

  const {
    data: profile,
    isFetching,
    isSuccess,
  } = useQuery({
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

  const [name, setName] = useState('')
  const [loadedName, setLoadedName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [website, setWebsite] = useState('')
  const [homeCityUuid, setHomeCityUuid] = useState<string | null>(null)
  const [interests, setInterests] = useState<string[]>([])
  const [loaded, setLoaded] = useState<ExplorerProfile | null>(null)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  // The photo on screen, when it differs from the saved one: the picked file
  // while it uploads, the server's URL once it has, `null` once removed.
  // `undefined` means "show whatever is saved".
  const [photoOverride, setPhotoOverride] = useState<string | null | undefined>(undefined)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoMessage, setPhotoMessage] = useState('')

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

    const savedName = profile?.name ?? currentUser?.name ?? ''
    setName(savedName)
    setLoadedName(savedName)
    setUsername(profile?.username ?? '')
    setBio(profile?.bio ?? '')
    setWebsite(profile?.website ?? '')
    setHomeCityUuid(profile?.home_city?.uuid ?? null)
    setInterests(profile?.interests ?? [])
    setLoaded(profile ?? null)
    setSeeded(true)
  }, [profile, isFetching, isSuccess, seeded, currentUser?.name])

  /**
   * A name or a photo is shown on far more than this screen — your profile,
   * every post you wrote, the feed — so every one of those answers is dropped
   * and read again. The server clears its own cached copies of the same lists
   * when either changes (`ForgetAuthorListsWhenAnExplorerChanges`).
   */
  function refreshEverywhereYouAppear(): void {
    void queryClient.invalidateQueries({ queryKey: ['explorer-profile'] })
    void queryClient.invalidateQueries({ queryKey: ['explorer-posts'] })
    void queryClient.invalidateQueries({ queryKey: ['feed'] })
  }

  const mutation = useMutation({
    mutationFn: async (request: SaveRequest): Promise<{ nameChanged: boolean }> => {
      // The name first, and on its own. If the profile half is then refused
      // (a taken username), the name has genuinely been saved, and the
      // baseline moves with it so pressing Save again does not resend it.
      if (request.name !== null) {
        const saved = await updateDisplayName(request.name)
        setLoadedName(saved.name)
        const user = useAuthStore.getState().user
        if (user) useAuthStore.getState().setUser({ ...user, name: saved.name })
      }

      if (request.sendProfile) await updateMyProfile(request.changes)

      return { nameChanged: request.name !== null }
    },
    onSuccess: ({ nameChanged }) => {
      void queryClient.invalidateQueries({ queryKey: ['explorer-profile', 'me'] })
      if (nameChanged) refreshEverywhereYouAppear()
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

  /** Both "Save" in the header and "Save changes" at the bottom land here. */
  function save(): void {
    if (mutation.isPending) return
    setFormError('')
    setFieldErrors({})

    if (!online) {
      setFormError('Saving needs a connection.')
      return
    }

    // The server's rule is the same, but its words are "The name field must
    // be a string." — which reads as the app's fault, not the person's.
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setFieldErrors({ name: ["Your display name can't be empty."] })
      return
    }

    const newName = trimmedName !== loadedName ? trimmedName : null
    const changes = changedFields()

    mutation.mutate({
      name: newName,
      changes,
      // A name-only edit has nothing to tell the profile endpoint. Otherwise
      // it is called as it always was — including with `{}`, which is what a
      // press on an untouched form has always sent.
      sendProfile: newName === null || Object.keys(changes).length > 0,
    })
  }

  /**
   * After the server has accepted a new photo, or none: the auth store is the
   * instant copy for anything reading the signed-in user, the profile answer
   * is patched so the header underneath is right before its refetch lands, and
   * every list you appear in is read again.
   */
  function photoChanged(url: string | null): void {
    const user = useAuthStore.getState().user
    if (user) useAuthStore.getState().setUser({ ...user, avatar: url ?? undefined })

    queryClient.setQueryData<ExplorerProfile | null>(['explorer-profile', 'me'], (old) =>
      old ? { ...old, avatar_url: url } : old,
    )
    refreshEverywhereYouAppear()
  }

  /**
   * Pick, show at once, upload. The photo is on screen before the server has
   * answered; if the server refuses, the one before it comes back, so a failed
   * upload never looks like a lost photo.
   */
  async function changePhoto(): Promise<void> {
    if (photoBusy) return
    setPhotoMessage('')

    if (!online) {
      setPhotoMessage('Changing your photo needs a connection.')
      return
    }

    let picked: Awaited<ReturnType<typeof pickAvatar>>
    try {
      picked = await pickAvatar()
    } catch {
      setPhotoMessage("Couldn't read that photo. Try a different one.")
      return
    }

    if (picked.kind === 'cancelled') return
    if (picked.kind === 'denied') {
      setPhotoMessage('Allow Stourify to use your photos to change your picture.')
      return
    }

    const before = photoOverride
    setPhotoOverride(picked.file.uri)
    setPhotoBusy(true)

    try {
      const url = await uploadAvatar(picked.file)
      setPhotoOverride(url)
      photoChanged(url)
    } catch (error) {
      setPhotoOverride(before)
      setPhotoMessage(
        firstError(extractValidationErrors(error), 'avatar') ??
          "Couldn't change your photo. Your old one is still there.",
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  async function removePhoto(): Promise<void> {
    if (photoBusy) return
    setPhotoMessage('')

    if (!online) {
      setPhotoMessage('Removing your photo needs a connection.')
      return
    }

    const before = photoOverride
    setPhotoOverride(null)
    setPhotoBusy(true)

    try {
      await removeAvatar()
      photoChanged(null)
    } catch {
      setPhotoOverride(before)
      setPhotoMessage("Couldn't remove your photo. It's still there.")
    } finally {
      setPhotoBusy(false)
    }
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

  const title = seeded && loaded === null ? 'Set up your profile' : 'Edit profile'
  const savedPhoto = profile?.avatar_url ?? currentUser?.avatar ?? null
  const shownPhoto = photoOverride === undefined ? savedPhoto : photoOverride

  const saveLink = (
    <Pressable
      onPress={save}
      disabled={!seeded || mutation.isPending}
      accessibilityRole="button"
      hitSlop={theme.spacing[2]}
      style={{ opacity: !seeded || mutation.isPending ? 0.5 : 1 }}
    >
      <Text variant="button" color="primary" style={{ fontFamily: theme.fontFamily.bodyBold }}>
        Save
      </Text>
    </Pressable>
  )

  // The form does not exist until the read has landed and seeded it. Rendering
  // the inputs first and filling them in afterwards looks harmless and is not:
  // anything typed in that gap is silently overwritten the moment the profile
  // arrives, which is the worst kind of lost edit because nothing reports it.
  if (!seeded) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={['top']}>
        <BarHeader title={title} onBack={() => navigation.goBack()} right={saveLink} />
        <View style={{ padding: theme.gutter, gap: theme.spacing[3] }}>
          <Skeleton height={100} />
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
      <BarHeader title={title} onBack={() => navigation.goBack()} right={saveLink} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.gutter,
            paddingBottom: theme.spacing[4],
            gap: theme.spacing[4],
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View
            style={{ alignItems: 'center', gap: theme.spacing[2], paddingTop: theme.spacing[2] }}
          >
            <Pressable onPress={() => void changePhoto()} disabled={photoBusy}>
              <Avatar uri={shownPhoto} name={loadedName || username} size={100} />
              {/* The canvas's `.cam` badge: it says the picture itself is the button. */}
              <View
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.hairline,
                }}
              >
                {photoBusy ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon name="camera" size={16} color="primary" />
                )}
              </View>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing[4] }}>
              <Pressable
                onPress={() => void changePhoto()}
                disabled={photoBusy}
                accessibilityRole="button"
                hitSlop={theme.spacing[2]}
              >
                <Text
                  variant="button"
                  color="primary"
                  style={{ fontFamily: theme.fontFamily.bodyBold }}
                >
                  Change photo
                </Text>
              </Pressable>
              {shownPhoto ? (
                <Pressable
                  onPress={() => void removePhoto()}
                  disabled={photoBusy}
                  accessibilityRole="button"
                  hitSlop={theme.spacing[2]}
                >
                  <Text variant="button" color="muted">
                    Remove photo
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {photoMessage ? (
              <Text variant="caption" color="danger" style={{ textAlign: 'center' }}>
                {photoMessage}
              </Text>
            ) : null}
          </View>

          <Input
            testID="edit-profile-name"
            label="Display name"
            size="lg"
            placeholder="The name other explorers see"
            value={name}
            onChangeText={(text) => {
              setName(text)
              clearFieldError('name')
            }}
            autoCapitalize="words"
            maxLength={NAME_MAX}
            error={firstError(fieldErrors, 'name')}
          />

          <Input
            testID="edit-profile-username"
            label="Username"
            size="lg"
            prefix="@"
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
            label="Bio"
            size="lg"
            counter={`${bio.length} / ${BIO_MAX}`}
            placeholder="A line or two about how you explore."
            value={bio}
            onChangeText={(text) => {
              setBio(text)
              clearFieldError('bio')
            }}
            multiline
            maxLength={BIO_MAX}
            error={firstError(fieldErrors, 'bio')}
          />

          <View style={{ gap: theme.spacing[2] }}>
            <FieldLabel>Home city</FieldLabel>

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

          <Input
            testID="edit-profile-website"
            label="Website"
            size="lg"
            icon="link"
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
            <FieldLabel>Interests</FieldLabel>

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
        </ScrollView>

        {/* Pinned under the scroll, as the canvas's `.sticky` draws it. */}
        <View
          style={{
            paddingHorizontal: theme.gutter,
            paddingTop: theme.spacing[3],
            paddingBottom: theme.spacing[4],
            backgroundColor: theme.colors.surface,
            borderTopWidth: 1,
            borderTopColor: theme.colors.hairline,
          }}
        >
          <Button
            label="Save changes"
            onPress={save}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** What one press of Save sends, decided before either request goes out. */
interface SaveRequest {
  /** The new display name, or `null` when it did not change. */
  name: string | null
  changes: ProfileWrite
  sendProfile: boolean
}

/**
 * The label above a field that is not a text box — the canvas's
 * `.field-label`, drawn exactly like `Input`'s `lg` label so every label on
 * the screen matches.
 */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text variant="micro" color="muted" style={{ fontSize: 12, letterSpacing: 0.6 }}>
      {children}
    </Text>
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
  return a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')
}
