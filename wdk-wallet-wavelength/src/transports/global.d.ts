declare const Bare: {
  readonly platform: 'linux' | 'darwin' | 'win32' | 'ios' | 'android'
  readonly arch: string
  readonly pid: number
  readonly versions: { readonly bare: string }
}

declare const BareKit: {
  readonly IPC: {
    write (data: string | Uint8Array): void
    on (event: 'data', listener: (chunk: unknown) => void): void
  }
}

// react-native is the app's dependency, not this package's, so typecheck
// against just the name wavelength-native-module.js uses.
declare module 'react-native' {
  export const Platform: { readonly OS: string }
}

// Likewise the app's dependency; only the part of it the relay drives.
declare module '@lightninglabs/wavelength-react-native' {
  export const NativeWavelength: {
    call (method: string, paramsJson: string): Promise<string>
    startActivity (reqJson: string): Promise<void>
    stopActivity (): Promise<void>
  }
}
