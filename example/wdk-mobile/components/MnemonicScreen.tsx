import { ScrollView, Text, View } from 'react-native'

import type { Screen } from '../lib/types'
import { AppButton, Card, COLORS } from './ui'

export function MnemonicScreen({
  mnemonic,
  copiedField,
  handleCopy,
  setScreen,
}: {
  mnemonic: string[] | null
  copiedField: string | null
  handleCopy: (text: string, field: string) => void
  setScreen: (screen: Screen) => void
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 12 }}>
          ⚠️ Keep this safe. Anyone with this phrase can steal your wallet.
        </Text>
        {mnemonic && (
          <View style={{ flexWrap: 'wrap', flexDirection: 'row', gap: 8 }}>
            {mnemonic.map((word, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: COLORS.bg,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: 'monospace' }}>
                  {i + 1}. {word}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      {mnemonic && (
        <AppButton
          label={copiedField === 'mnemonic' ? 'Copied -- clear your clipboard after pasting it' : 'Copy Phrase'}
          onPress={() => handleCopy(mnemonic.join(' '), 'mnemonic')}
          variant="secondary"
        />
      )}

      <AppButton label="Back to Wallet" onPress={() => setScreen('home')} variant="primary" style={{ marginBottom: 20 }} />
    </ScrollView>
  )
}
