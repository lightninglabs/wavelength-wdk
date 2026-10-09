import { Text, View } from 'react-native'

import { NETWORK_CONFIG } from '../lib/constants'
import type { Screen } from '../lib/types'
import { AppButton, Card, COLORS } from './ui'

const NETWORK_CONFIG_ROWS: [label: string, value: string][] = [
  ['Network', NETWORK_CONFIG.network],
  ['Wallet type', NETWORK_CONFIG.walletType],
  ['Esplora URL', NETWORK_CONFIG.walletEsploraUrl],
  ['Ark server', NETWORK_CONFIG.arkServerAddress],
  ['Swap server', NETWORK_CONFIG.swapServerAddress],
]

export function AccountTab({
  loading,
  handleOpenExit,
  handleShowMnemonic,
  setScreen,
}: {
  loading: string | null
  handleOpenExit: () => void
  handleShowMnemonic: () => void
  setScreen: (screen: Screen) => void
}) {
  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      <Card>
        <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 12 }}>Network</Text>
        {NETWORK_CONFIG_ROWS.map(([label, value]) => (
          <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: COLORS.dim, fontSize: 11 }}>{label}</Text>
            <Text style={{ color: COLORS.text, fontSize: 11, fontFamily: 'monospace', flexShrink: 1, textAlign: 'right' }}>
              {value}
            </Text>
          </View>
        ))}
      </Card>

      <AppButton
        label="Exit Wallet"
        onPress={handleOpenExit}
        loading={loading === 'exit-open'}
        variant="secondary"
      />

      <AppButton
        label="View Recovery Phrase"
        onPress={handleShowMnemonic}
        disabled={loading !== null}
        variant="secondary"
      />

      <AppButton
        label="Debug Logs"
        onPress={() => setScreen('logs')}
        variant="secondary"
        textColor={COLORS.dim}
      />
    </View>
  )
}
