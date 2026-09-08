import type { EntryKind } from './types'

export function formatBalance(satoshis: bigint | null | undefined) {
  if (satoshis === null || satoshis === undefined) return '—'
  const btc = Number(satoshis) / 1e8
  return btc.toFixed(8)
}

export function formatSats(satoshis: bigint) {
  return satoshis.toLocaleString()
}

export function formatPubkey(pubkey: string | undefined) {
  if (!pubkey) return ''
  return `${pubkey.slice(0, 6)}...${pubkey.slice(-6)}`
}

// 'deposit'/'receive'/'exit' add funds to the wallet; 'send' removes them.
// amountSat itself is an unsigned magnitude -- the sign is inferred from
// kind, matching how every wallet app displays a transaction list.
export function isIncomingEntry(kind: EntryKind) {
  return kind !== 'send'
}

export const ENTRY_KIND_ICON: Record<EntryKind, string> = {
  send: '↑',
  receive: '↓',
  deposit: '⛁',
  exit: '⎋',
}

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  send: 'Sent',
  receive: 'Received',
  deposit: 'Deposit',
  exit: 'Exit',
}

export function formatRelativeTime(iso: string | undefined) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString()
}
