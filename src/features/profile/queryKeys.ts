/**
 * The cache key for your own list of blocked accounts.
 *
 * Shared by `BlockedAccountsScreen`, which lists them, and
 * `PrivacySecurityScreen`, which shows how many there are (STOURIFY-290). One
 * key means one cached answer: unblock somebody and the count on the screen
 * behind agrees with the list without a second request.
 */
export const BLOCKS_QUERY_KEY = ['blocks'] as const
