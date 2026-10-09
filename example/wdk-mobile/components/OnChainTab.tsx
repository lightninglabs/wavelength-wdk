import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native'

import type { WalletState } from '../lib/types'
import { AppButton, Card, COLORS } from './ui'

export function OnChainTab({
  walletState,
  loadingAddress,
  depositAddress,
  fetchDepositAddress,
  copiedField,
  handleCopy,
  sendTo,
  setSendTo,
  sendAmount,
  setSendAmount,
  loading,
  handleSendTransaction,
}: {
  walletState: WalletState
  loadingAddress: boolean
  depositAddress: string | null
  fetchDepositAddress: () => void
  copiedField: string | null
  handleCopy: (text: string, field: string) => void
  sendTo: string
  setSendTo: (value: string) => void
  sendAmount: string
  setSendAmount: (value: string) => void
  loading: string | null
  handleSendTransaction: () => void
}) {
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ color: COLORS.dim, fontSize: 12 }}>Deposit Address</Text>
          <TouchableOpacity
            onPress={fetchDepositAddress}
            disabled={loadingAddress}
            style={{
              backgroundColor: COLORS.border,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 6,
              opacity: loadingAddress ? 0.5 : 1,
            }}
          >
            {loadingAddress ? (
              <ActivityIndicator color={COLORS.accent} size="small" />
            ) : (
              <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '600' }}>New Address</Text>
            )}
          </TouchableOpacity>
        </View>
        {walletState !== 'unlocked' || (loadingAddress && !depositAddress) ? (
          // The address isn't fetched until unlocked; without this branch the
          // card would show a false failure/Retry.
          <View style={{ marginBottom: 12 }}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        ) : depositAddress ? (
          <>
            <Text
              selectable
              style={{ color: COLORS.accent, fontSize: 12, fontFamily: 'monospace', marginBottom: 12, lineHeight: 18 }}
            >
              {depositAddress}
            </Text>
            <AppButton
              label={copiedField === 'deposit-address' ? 'Copied' : 'Copy'}
              onPress={() => handleCopy(depositAddress, 'deposit-address')}
              variant="secondary"
              style={{ paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' }}
            />
          </>
        ) : (
          <>
            <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 12 }}>Failed to load address</Text>
            <AppButton
              label="Retry"
              onPress={fetchDepositAddress}
              loading={loadingAddress}
              variant="primary"
              style={{ paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' }}
            />
          </>
        )}
      </Card>

      <Card>
        <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 16 }}>Send Bitcoin</Text>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Recipient Address</Text>
          <TextInput
            placeholder="tb1q..."
            placeholderTextColor={COLORS.dim}
            value={sendTo}
            onChangeText={setSendTo}
            editable={!loading}
            style={{
              backgroundColor: COLORS.bg,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 6,
              padding: 12,
              color: COLORS.text,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Amount (Satoshis)</Text>
          <TextInput
            placeholder="1000"
            placeholderTextColor={COLORS.dim}
            value={sendAmount}
            onChangeText={setSendAmount}
            keyboardType="numeric"
            editable={!loading}
            style={{
              backgroundColor: COLORS.bg,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 6,
              padding: 12,
              color: COLORS.text,
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />
        </View>

        <AppButton
          label="Send"
          onPress={handleSendTransaction}
          loading={loading === 'quote-send' || loading === 'send'}
          variant="danger"
        />
      </Card>
    </>
  )
}
