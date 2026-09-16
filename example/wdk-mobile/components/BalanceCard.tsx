import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

import { formatBalance, formatSats } from '../lib/format'
import type { WalletData } from '../lib/types'
import { AppButton, Card, COLORS } from './ui'

export function BalanceCard({
  walletData,
  loading,
  balanceError,
  handleRefresh,
}: {
  walletData: WalletData
  loading: string | null
  balanceError: string | null
  handleRefresh: () => void
}) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ color: COLORS.dim, fontSize: 12 }}>Total Balance</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={loading === 'refresh'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loading === 'refresh' ? 0.5 : 1,
          }}
        >
          {loading === 'refresh' ? (
            <ActivityIndicator color={COLORS.accent} size="small" />
          ) : (
            <Text style={{ color: COLORS.accent, fontSize: 14 }}>⟳</Text>
          )}
        </TouchableOpacity>
      </View>
      {loading === 'refresh' && !walletData.balances ? (
        <ActivityIndicator color={COLORS.accent} size="large" />
      ) : !walletData.balances && balanceError ? (
        <>
          <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 12 }}>
            Failed to load balance: {balanceError}
          </Text>
          <AppButton
            label="Retry"
            onPress={handleRefresh}
            loading={loading === 'refresh'}
            variant="primary"
            style={{ paddingVertical: 10, paddingHorizontal: 16, alignSelf: 'flex-start' }}
          />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={{ color: COLORS.text, fontSize: 36, fontWeight: 'bold' }}>
              {formatBalance(walletData.balances?.confirmed)}
            </Text>
            <Text style={{ color: COLORS.dim, fontSize: 14 }}>BTC</Text>
          </View>
          <Text style={{ color: COLORS.dim, fontSize: 11, marginTop: 4 }}>
            {walletData.balances ? `${formatSats(walletData.balances.confirmed)} sats` : ''}
          </Text>
          {balanceError && (
            <Text style={{ color: COLORS.error, fontSize: 11, marginTop: 8 }}>
              Last refresh failed: {balanceError}
            </Text>
          )}
        </>
      )}
      {walletData.syncStatus && (
        <Text style={{ color: COLORS.accent, fontSize: 11, marginTop: 12 }}>
          Status: {walletData.syncStatus}
        </Text>
      )}
    </Card>
  )
}
