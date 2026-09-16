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
