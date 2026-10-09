import { Text, TouchableOpacity, View } from 'react-native'

import { COLORS } from './ui'

export type HomeTab = 'lightning' | 'onchain' | 'activity' | 'account'

const TABS = [
  { key: 'lightning', icon: '⚡', label: 'Lightning' },
  { key: 'onchain', icon: '⛓️', label: 'On-chain' },
  { key: 'activity', icon: '📋', label: 'Activity' },
  { key: 'account', icon: '👤', label: 'Account' },
] as const

export function BottomTabBar({
  homeTab,
  setHomeTab,
  handleShowActivity,
}: {
  homeTab: HomeTab
  setHomeTab: (tab: HomeTab) => void
  handleShowActivity: () => void
}) {
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.cardBg }}>
      {TABS.map((tab) => {
        const active = homeTab === tab.key
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              if (tab.key === 'activity') handleShowActivity()
              else setHomeTab(tab.key)
            }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ fontSize: 18 }}>{tab.icon}</Text>
            <Text style={{ fontSize: 10, marginTop: 2, color: active ? COLORS.accent : COLORS.dim, fontWeight: active ? 'bold' : 'normal' }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
