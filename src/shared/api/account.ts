import { client } from './client'

/**
 * Permanently delete the signed-in account.
 *
 * Both arguments are required by the server, which checks the email against the
 * caller's own address and the password with `current_password`. That is
 * deliberate double confirmation, not redundancy: this endpoint sits one row
 * below Logout in the same settings list and, unlike deactivation, nothing an
 * administrator can do brings the account back.
 *
 * The caller is responsible for tearing the local session down afterwards via
 * `signOut()` — the server has revoked every token by the time this resolves,
 * so anything still holding the old one will start failing.
 */
export async function deleteAccount(email: string, password: string): Promise<void> {
  // 60s, not the client's 15s default. Deletion is the longest write the app
  // makes: the server revokes tokens, then withdraws every spot, post, review,
  // wishlist item, follow edge and profile the account owns, writing a sync
  // tombstone for each. On the dev rig that measured 19 seconds — past the
  // default — and the failure it produced is the worst possible one, because
  // the server had already finished. See `DELETION_TIMEOUT_NOTE` below.
  await client.delete('/me', { data: { email, password }, timeout: 60000 })
}

/**
 * DELETION_TIMEOUT_NOTE — why a timed-out deletion signs the user out anyway.
 *
 * A request that returns an error and a request that returns nothing are not
 * the same fact. The server rejecting the deletion — wrong password, wrong
 * email — is a definite "your account still exists", and the right response is
 * to show the message and leave the session alone.
 *
 * A timeout says nothing at all. The request may never have arrived, or it may
 * have completed perfectly and the reply may have been lost on the way back.
 * That second case was observed live: the account was deleted, every token was
 * revoked, and the app told the user it had failed and left them "signed in"
 * holding a token that no longer existed. Every retry from there answers 401,
 * which reads as a bug rather than as success.
 *
 * So the two are handled differently, and the asymmetry is deliberate. Signing
 * out after a timeout that changed nothing costs one login. Staying signed in
 * after a timeout that deleted everything is an app that cannot recover.
 */
export function deletionOutcomeIsUnknown(error: unknown): boolean {
  return (error as { response?: unknown } | null)?.response === undefined
}
