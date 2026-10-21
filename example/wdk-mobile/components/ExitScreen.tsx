import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'

import type { ExitPlanEntry, ExitSummaryData, Screen, SweepPreview, WalletVTXO } from '../lib/types'
import { AppButton, Card, COLORS } from './ui'

export function ExitScreen({
  exitSummaryData,
  vtxos,
  exitTargetOutpoint,
  handleSelectExitTarget,
  handleCheckExitStatus,
  loading,
  exitMode,
  setExitMode,
  exitDestination,
  setExitDestination,
  exitPlan,
  setExitPlan,
  setExitTargetOutpoint,
  handlePreviewExitPlan,
  handleStartExit,
  sweepDestination,
  setSweepDestination,
  sweepPreview,
  setSweepPreview,
  handlePreviewSweep,
  handleBroadcastSweep,
  handleOpenExit,
  setScreen,
}: {
  exitSummaryData: ExitSummaryData | null
  vtxos: WalletVTXO[]
  exitTargetOutpoint: string | null
  handleSelectExitTarget: (outpoint: string) => void
  handleCheckExitStatus: (outpoint: string) => void
  loading: string | null
  exitMode: 'cooperative' | 'unilateral'
  setExitMode: (mode: 'cooperative' | 'unilateral') => void
  exitDestination: string
  setExitDestination: (value: string) => void
  exitPlan: ExitPlanEntry | null
  setExitPlan: (plan: ExitPlanEntry | null) => void
  setExitTargetOutpoint: (outpoint: string | null) => void
  handlePreviewExitPlan: () => void
  handleStartExit: () => void
  sweepDestination: string
  setSweepDestination: (value: string) => void
  sweepPreview: SweepPreview | null
  setSweepPreview: (preview: SweepPreview | null) => void
  handlePreviewSweep: () => void
  handleBroadcastSweep: () => void
  handleOpenExit: () => void
  setScreen: (screen: Screen) => void
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Card>
        <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 12 }}>Exit Summary</Text>
        {exitSummaryData && exitSummaryData.totalExits > 0 ? (
          <>
            <Text style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>
              {exitSummaryData.totalExits} in progress -- {exitSummaryData.totalVTXOAmountSat.toLocaleString()} sats
            </Text>
            <Text style={{ color: COLORS.dim, fontSize: 11 }}>
              Est. fees: {exitSummaryData.totalEstFeeSat.toLocaleString()} sats -- est. net recovered: {exitSummaryData.totalEstNetRecoveredSat.toLocaleString()} sats
            </Text>
          </>
        ) : (
          <Text style={{ color: COLORS.dim, fontSize: 13 }}>No exits in progress.</Text>
        )}
      </Card>

      <Card>
        <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 12 }}>VTXOs</Text>
        {vtxos.length === 0 && (
          <Text style={{ color: COLORS.dim, fontSize: 13 }}>No VTXOs.</Text>
        )}
        {vtxos.map((v) => (
          <View
            key={v.outpoint}
            style={{
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: COLORS.border,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: 'monospace' }}>
                {v.outpoint.slice(0, 10)}...{v.outpoint.slice(-6)}
              </Text>
              <Text style={{ color: COLORS.dim, fontSize: 11, marginTop: 2 }}>
                {v.amountSat.toLocaleString()} sats -- {v.status}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => handleCheckExitStatus(v.outpoint)}
                disabled={loading === `exit-status:${v.outpoint}`}
                style={{ backgroundColor: COLORS.border, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 }}
              >
                {loading === `exit-status:${v.outpoint}` ? (
                  <ActivityIndicator color={COLORS.accent} size="small" />
                ) : (
                  <Text style={{ color: COLORS.text, fontSize: 11 }}>Status</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSelectExitTarget(v.outpoint)}
                style={{ backgroundColor: COLORS.accent, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 }}
              >
                <Text style={{ color: COLORS.bg, fontSize: 11, fontWeight: 'bold' }}>Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      {exitTargetOutpoint && (
        <Card borderColor={COLORS.accent}>
          <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 4 }}>Exiting</Text>
          <Text style={{ color: COLORS.text, fontSize: 12, fontFamily: 'monospace', marginBottom: 16 }}>
            {exitTargetOutpoint}
          </Text>

          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => { setExitMode('cooperative'); setExitPlan(null) }}
              style={{
                flex: 1,
                backgroundColor: exitMode === 'cooperative' ? COLORS.accent : COLORS.border,
                paddingVertical: 10,
                borderRadius: 6,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: exitMode === 'cooperative' ? COLORS.bg : COLORS.text, fontWeight: 'bold', fontSize: 13 }}>
                Cooperative
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setExitMode('unilateral'); setExitPlan(null) }}
              style={{
                flex: 1,
                backgroundColor: exitMode === 'unilateral' ? COLORS.accent : COLORS.border,
                paddingVertical: 10,
                borderRadius: 6,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: exitMode === 'unilateral' ? COLORS.bg : COLORS.text, fontWeight: 'bold', fontSize: 13 }}>
                Unilateral
              </Text>
            </TouchableOpacity>
          </View>

          {exitMode === 'cooperative' ? (
            <>
              <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Destination (optional)</Text>
              <TextInput
                placeholder="tb1q... (leave blank for a wallet address)"
                placeholderTextColor={COLORS.dim}
                value={exitDestination}
                onChangeText={setExitDestination}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  backgroundColor: COLORS.bg,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 6,
                  padding: 12,
                  color: COLORS.text,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  marginBottom: 16,
                }}
              />
              <AppButton
                label="Start Cooperative Exit"
                onPress={handleStartExit}
                loading={loading === 'exit-start'}
                variant="primary"
              />
            </>
          ) : (
            <>
              <AppButton
                label="Preview Plan"
                onPress={handlePreviewExitPlan}
                loading={loading === 'exit-plan'}
                variant="secondary"
                style={{ paddingVertical: 10, marginBottom: 12 }}
              />

              {exitPlan && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: exitPlan.canStart ? COLORS.accent : COLORS.error, fontSize: 12, fontWeight: 'bold', marginBottom: 6 }}>
                    {exitPlan.canStart ? 'Ready to start' : `Cannot start: ${exitPlan.infeasibilityReason}`}
                  </Text>
                  <Text style={{ color: COLORS.dim, fontSize: 11 }}>
                    Funding shortfall: {exitPlan.fundingShortfallSat.toLocaleString()} sats
                  </Text>
                  <Text style={{ color: COLORS.dim, fontSize: 11, marginBottom: 12 }}>
                    Recommended funding: {exitPlan.recommendedTotalFundingSat.toLocaleString()} sats
                  </Text>

                  {exitPlan.canStart && (
                    <>
                      <Text style={{ color: COLORS.error, fontSize: 11, marginBottom: 12 }}>
                        ⚠️ This forces the VTXO on-chain and cannot be undone -- it can take hours or days to complete.
                      </Text>
                      <AppButton
                        label="Confirm Unilateral Exit"
                        onPress={handleStartExit}
                        loading={loading === 'exit-start'}
                        variant="danger"
                      />
                    </>
                  )}
                </View>
              )}
            </>
          )}

          <TouchableOpacity
            onPress={() => { setExitTargetOutpoint(null); setExitPlan(null) }}
            style={{ paddingVertical: 10, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: COLORS.dim, fontSize: 12 }}>Cancel</Text>
          </TouchableOpacity>
        </Card>
      )}

      <Card>
        <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 16 }}>Sweep Wallet</Text>
        <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Destination Address</Text>
        <TextInput
          placeholder="tb1q..."
          placeholderTextColor={COLORS.dim}
          value={sweepDestination}
          onChangeText={(text) => { setSweepDestination(text); setSweepPreview(null) }}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            backgroundColor: COLORS.bg,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 6,
            padding: 12,
            color: COLORS.text,
            fontFamily: 'monospace',
            fontSize: 12,
            marginBottom: 16,
          }}
        />
        <AppButton
          label="Preview Sweep"
          onPress={handlePreviewSweep}
          loading={loading === 'sweep-preview'}
          disabled={!sweepDestination}
          variant="secondary"
          style={{ paddingVertical: 10, marginBottom: 12 }}
        />

        {sweepPreview && (
          <View>
            <Text style={{ color: COLORS.dim, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
              Net amount: {sweepPreview.netAmountSat.toLocaleString()} sats (fee {sweepPreview.estimatedFeeSat.toLocaleString()} sats)
            </Text>
            {!sweepPreview.canBroadcast ? (
              <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
                Cannot broadcast: {sweepPreview.failureReason}
              </Text>
            ) : (
              <AppButton
                label="Broadcast Sweep"
                onPress={handleBroadcastSweep}
                loading={loading === 'sweep-broadcast'}
                variant="danger"
              />
            )}
          </View>
        )}
      </Card>

      <AppButton label="Refresh" onPress={handleOpenExit} loading={loading === 'exit-open'} variant="secondary" />

      <AppButton
        label="Back to Wallet"
        onPress={() => setScreen('home')}
        variant="primary"
        style={{ marginBottom: 20 }}
      />
    </ScrollView>
  )
}
