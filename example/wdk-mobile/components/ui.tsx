import type { ReactNode } from 'react'
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native'

import type { ButtonVariant } from '../lib/types'

export const COLORS = {
  bg: '#0b0d0f',
  border: '#22262b',
  dim: '#5c6570',
  text: '#c7d0d9',
  accent: '#5fd68a',
  error: '#ff6161',
  errorBg: '#1f1113',
  cardBg: '#141820',
}

export function HeaderLogo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Image
        source={require('../assets/images/wavelength-wordmark.png')}
        style={{ width: 175, height: 40 }}
        resizeMode="contain"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: COLORS.dim, fontSize: 12 }}>Powered by</Text>
        <Image
          source={require('../assets/images/wdk-logo-dark.png')}
          style={{ width: 50, height: 18 }}
          resizeMode="contain"
        />
      </View>
    </View>
  )
}

// `borderColor` is the only override call sites need; anything else goes
// through `style`.
export function Card({ children, style, borderColor }: { children: ReactNode; style?: object; borderColor?: string }) {
  return (
    <View
      style={[
        { backgroundColor: COLORS.cardBg, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: borderColor || COLORS.border },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function AppButton({
  label,
  onPress,
  variant = 'secondary',
  loading = false,
  disabled = false,
  style,
  textColor,
}: {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  loading?: boolean
  disabled?: boolean
  style?: object
  textColor?: string
}) {
  const bg = variant === 'primary' ? COLORS.accent : variant === 'danger' ? COLORS.error : COLORS.border
  const fg = textColor || (variant === 'secondary' ? COLORS.text : COLORS.bg)
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        { backgroundColor: bg, paddingVertical: 12, borderRadius: 6, alignItems: 'center', opacity: isDisabled ? 0.6 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: 'bold', fontSize: 14 }}>{label}</Text>}
    </TouchableOpacity>
  )
}
