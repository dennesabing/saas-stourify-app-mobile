/**
 * The interests an explorer can pick, in one place.
 *
 * Two screens offer this choice — onboarding's `InterestsScreen` and
 * `EditProfileScreen` — and they have to offer the same options. Two hardcoded
 * lists would drift the first time somebody adds an option to one of them, and
 * the symptom is quiet: an interest picked during onboarding simply stops
 * appearing as a choice on the edit screen, so re-saving there silently drops
 * it.
 *
 * The server does not enforce this list (`interests.*` is just `string|max:40`),
 * so a value outside it is legal. Callers should render any existing interest
 * they were given even when it is not here, rather than hiding it.
 */
export const INTEREST_OPTIONS = [
  'Nature',
  'Food',
  'History',
  'Art',
  'Beach',
  'Nightlife',
  'Culture',
  'Adventure',
] as const
