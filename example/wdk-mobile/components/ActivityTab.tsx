import { Text, TouchableOpacity, View } from 'react-native'

import { ENTRY_KIND_ICON, ENTRY_KIND_LABEL, formatRelativeTime, isIncomingEntry } from '../lib/format'
import type { ActivityEntry } from '../lib/types'
import { COLORS } from './ui'

// Minimal, dependency-free syntax highlighting for the raw-JSON detail view
// -- just enough to tell keys apart from values at a glance, without pulling
// in a highlighting library for one debug-ish view.
function JsonView({ value }: { value: unknown }) {
  const lines = JSON.stringify(value, null, 2).split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const match = line.match(/^(\s*)"([^"]+)":\s*(.*)$/)
        if (!match) {
          return (
            <Text key={i} selectable style={{ color: COLORS.dim, fontSize: 11, fontFamily: 'monospace', lineHeight: 16 }}>
              {line}
            </Text>
          )
        }
        const [, indent, key, rest] = match
        return (
          <Text key={i} selectable style={{ fontSize: 11, fontFamily: 'monospace', lineHeight: 16 }}>
            <Text style={{ color: COLORS.dim }}>{indent}</Text>
            <Text style={{ color: COLORS.accent }}>"{key}"</Text>
            <Text style={{ color: COLORS.dim }}>: </Text>
            <Text style={{ color: COLORS.text }}>{rest}</Text>
          </Text>
        )
      })}
    </>
  )
}

export function ActivityTab({
  activityEntries,
  expandedEntryId,
  setExpandedEntryId,
}: {
  activityEntries: ActivityEntry[]
  expandedEntryId: string | null
  setExpandedEntryId: (id: string | null) => void
}) {
  return (
    <>
      {activityEntries.length === 0 && (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📭</Text>
          <Text style={{ color: COLORS.dim, fontSize: 13 }}>No activity yet.</Text>
          <Text style={{ color: COLORS.dim, fontSize: 12, marginTop: 4 }}>Pull down to refresh.</Text>
        </View>
      )}

      {activityEntries.map((entry) => {
        const incoming = isIncomingEntry(entry.kind)
        const statusColor = entry.status === 'complete' ? COLORS.accent : entry.status === 'failed' ? COLORS.error : COLORS.dim
        const expanded = expandedEntryId === entry.id

        return (
          <TouchableOpacity
            key={entry.id}
            activeOpacity={0.7}
            onPress={() => setExpandedEntryId(expanded ? null : entry.id)}
            style={{ backgroundColor: COLORS.cardBg, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: COLORS.border }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ color: incoming ? COLORS.accent : COLORS.text, fontSize: 16 }}>
                  {ENTRY_KIND_ICON[entry.kind] || '•'}
                </Text>
              </View>

              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: 'bold' }}>
                  {ENTRY_KIND_LABEL[entry.kind] || entry.kind}
                </Text>
                <Text style={{ color: COLORS.dim, fontSize: 11, marginTop: 2 }}>
                  {formatRelativeTime(entry.createdAt)}
                </Text>
                {!!entry.counterparty && (
                  <Text
                    numberOfLines={1}
                    style={{ color: COLORS.dim, fontSize: 11, fontFamily: 'monospace', marginTop: 2 }}
                  >
                    {entry.counterparty}
                  </Text>
                )}
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: incoming ? COLORS.accent : COLORS.text, fontSize: 14, fontWeight: 'bold' }}>
                  {incoming ? '+' : '-'}{entry.amountSat?.toLocaleString() ?? '0'}
                </Text>
                <Text style={{ color: statusColor, fontSize: 11, marginTop: 2, textTransform: 'capitalize' }}>
                  {entry.status}
                </Text>
                {!!entry.feeSat && (
                  <Text style={{ color: COLORS.dim, fontSize: 11, marginTop: 2 }}>
                    Fee: {entry.feeSat.toLocaleString()}
                  </Text>
                )}
              </View>
            </View>

            {entry.status === 'failed' && entry.failureReason && (
              <Text style={{ color: COLORS.error, fontSize: 11, marginTop: 10 }}>{entry.failureReason}</Text>
            )}

            {expanded && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
                <JsonView value={entry} />
              </View>
            )}
          </TouchableOpacity>
        )
      })}
    </>
  )
}
