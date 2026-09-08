import { ScrollView, Text, View } from 'react-native'

import type { Screen } from '../lib/types'
import { AppButton, COLORS } from './ui'

export function LogsScreen({ logs, setScreen }: { logs: string[]; setScreen: (screen: Screen) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 4 }}>
        {logs.map((log, i) => (
          <Text
            key={i}
            style={{
              color: COLORS.dim,
              fontSize: 11,
              fontFamily: 'monospace',
              lineHeight: 14,
            }}
          >
            {log}
          </Text>
        ))}
      </ScrollView>

      <AppButton
        label="Back to Wallet"
        onPress={() => setScreen('home')}
        variant="primary"
        style={{ marginHorizontal: 16, marginBottom: 16 }}
      />
    </View>
  )
}
