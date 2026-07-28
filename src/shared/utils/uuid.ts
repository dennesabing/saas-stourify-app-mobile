/**
 * A v4 uuid, generated on the device.
 *
 * The uuid IS the row's identity: the local Watermelon record id, the key the
 * server resolves a push by, and therefore the whole basis of the "create
 * offline → reconnect → unduplicated" guarantee (M2a §4 point 3). It must be
 * minted before the write, never assigned by the server.
 *
 * Uses the platform generator when one exists and falls back to a correct
 * `Math.random` v4 otherwise, rather than pulling in another native module for
 * sixteen bytes.
 */
export function uuidv4(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto

  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID()

  const hex: string[] = []
  for (let i = 0; i < 256; i += 1) hex.push((i + 0x100).toString(16).slice(1))

  const bytes = new Array<number>(16)
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return (
    `${hex[bytes[0]]}${hex[bytes[1]]}${hex[bytes[2]]}${hex[bytes[3]]}-` +
    `${hex[bytes[4]]}${hex[bytes[5]]}-` +
    `${hex[bytes[6]]}${hex[bytes[7]]}-` +
    `${hex[bytes[8]]}${hex[bytes[9]]}-` +
    `${hex[bytes[10]]}${hex[bytes[11]]}${hex[bytes[12]]}${hex[bytes[13]]}${hex[bytes[14]]}${hex[bytes[15]]}`
  )
}
