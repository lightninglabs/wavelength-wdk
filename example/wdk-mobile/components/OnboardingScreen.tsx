import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'

import type { Screen } from '../lib/types'
import { AppButton, Card, COLORS, HeaderLogo } from './ui'

/** No wallet yet; covers the whole screen until a seed is generated or imported. */
export function OnboardingScreen({
  screen,
  loading,
  onboardingSeedPhrase,
  importSeedInput,
  setImportSeedInput,
  setScreen,
  handleStartCreateWallet,
  handleConfirmCreateWallet,
  handleSubmitImportWallet,
}: {
  screen: Screen
  loading: string | null
  onboardingSeedPhrase: string | null
  importSeedInput: string
  setImportSeedInput: (value: string) => void
  setScreen: (screen: Screen) => void
  handleStartCreateWallet: () => void
  handleConfirmCreateWallet: () => void
  handleSubmitImportWallet: () => void
}) {
  const onboardingScreen = screen === 'onboarding-create' || screen === 'onboarding-import' ? screen : 'home'

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 }}>
        <HeaderLogo />
      </View>

      {onboardingScreen === 'home' && (
        <View style={{ flex: 1, padding: 16, gap: 16, justifyContent: 'center' }}>
          <TouchableOpacity
            onPress={handleStartCreateWallet}
            disabled={loading === 'generate-seed'}
            style={{ backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 8, alignItems: 'center' }}
          >
            {loading === 'generate-seed' ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={{ color: COLORS.bg, fontWeight: 'bold', fontSize: 16 }}>Create New Wallet</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setScreen('onboarding-import')}
            style={{ backgroundColor: COLORS.border, paddingVertical: 16, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: COLORS.text, fontWeight: 'bold', fontSize: 16 }}>Import Existing Wallet</Text>
          </TouchableOpacity>
        </View>
      )}

      {onboardingScreen === 'onboarding-create' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Card>
            <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 12 }}>
              ⚠️ Write this down and keep it safe. Anyone with this phrase can steal your wallet -- it is never shown again.
            </Text>
            {onboardingSeedPhrase && (
              <View style={{ flexWrap: 'wrap', flexDirection: 'row', gap: 8 }}>
                {onboardingSeedPhrase.split(' ').map((word, i) => (
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

          <AppButton label="I've backed this up -- Continue" onPress={handleConfirmCreateWallet} variant="primary" />
        </ScrollView>
      )}

      {onboardingScreen === 'onboarding-import' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Card>
            <Text style={{ color: COLORS.text, fontSize: 12, marginBottom: 6 }}>Recovery phrase (12 or 24 words)</Text>
            <TextInput
              placeholder="word1 word2 word3 ..."
              placeholderTextColor={COLORS.dim}
              value={importSeedInput}
              onChangeText={setImportSeedInput}
              multiline
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
                minHeight: 100,
                textAlignVertical: 'top',
              }}
            />
          </Card>

          <AppButton label="Continue" onPress={handleSubmitImportWallet} variant="primary" />

          <AppButton label="Back" onPress={() => setScreen('home')} variant="secondary" />
        </ScrollView>
      )}
    </View>
  )
}
