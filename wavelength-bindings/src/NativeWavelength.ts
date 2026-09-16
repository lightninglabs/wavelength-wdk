import type { TurboModule } from 'react-native'
import { TurboModuleRegistry } from 'react-native'

/**
 * Ported from @lightninglabs/wavelength-react-native's NativeWavelength.ts,
 * minus passkeySupported/passkeyCreate/passkeyGet.
 */
export interface Spec extends TurboModule {
  call(method: string, paramsJson: string): Promise<string>
  startActivity(reqJson: string): Promise<void>
  stopActivity(): Promise<void>
  getDefaultDataDir(): Promise<string>
  addListener(eventName: string): void
  removeListeners(count: number): void
}

export default TurboModuleRegistry.get<Spec>('Wavelength')
