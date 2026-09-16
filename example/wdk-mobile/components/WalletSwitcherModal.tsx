import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'

import { formatPubkey } from '../lib/format'
import type { WalletMeta } from '../lib/types'
import { AppButton, COLORS } from './ui'

/** Account list bottom sheet -- a modal overlay, not a dedicated screen, since switching accounts should be quick and frequent. */
export function WalletSwitcherModal({
  visible,
  onClose,
  walletMeta,
  loading,
  pendingWalletIndex,
  accountIdentities,
  handleSwitchWallet,
  handleAddWallet,
}: {
  visible: boolean
  onClose: () => void
  walletMeta: WalletMeta
  loading: string | null
  pendingWalletIndex: number | null
  accountIdentities: Record<number, string>
  handleSwitchWallet: (index: number) => void
  handleAddWallet: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Absorbs taps so tapping inside the sheet doesn't fall through to the backdrop and close it. */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={{
            backgroundColor: COLORS.bg,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 16,
            paddingBottom: 32,
            maxHeight: '75%',
          }}
        >
          <View
            style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 }}
          />
          <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Wallets</Text>

          <ScrollView contentContainerStyle={{ gap: 12 }}>
            {walletMeta.accounts.map((index) => {
              const isSwitchingToThis = loading === 'switch-wallet' && pendingWalletIndex === index
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleSwitchWallet(index)}
                  disabled={loading === 'switch-wallet'}
                  style={{
                    backgroundColor: COLORS.cardBg,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: index === walletMeta.activeAccountIndex ? COLORS.accent : COLORS.border,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: loading === 'switch-wallet' && !isSwitchingToThis ? 0.5 : 1,
                  }}
                >
                  <View>
                    <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: 'bold' }}>Wallet {index}</Text>
                    {isSwitchingToThis ? (
                      <Text style={{ color: COLORS.accent, fontSize: 11, marginTop: 4 }}>Loading...</Text>
                    ) : (
                      accountIdentities[index] && (
                        <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: 'monospace', marginTop: 4, letterSpacing: 0.5 }}>
                          {formatPubkey(accountIdentities[index])}
                        </Text>
                      )
                    )}
                  </View>
                  {isSwitchingToThis ? (
                    <ActivityIndicator color={COLORS.accent} size="small" />
                  ) : (
                    index === walletMeta.activeAccountIndex && (
                      <Text style={{ color: COLORS.accent, fontSize: 12, fontWeight: 'bold' }}>Active</Text>
                    )
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <AppButton
            label="+ Add Wallet"
            onPress={handleAddWallet}
            loading={loading === 'add-wallet'}
            disabled={loading === 'switch-wallet'}
            variant="primary"
            style={{ marginTop: 12 }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}
