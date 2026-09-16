// Deliberately minimal: the addon is loaded via Bare's `require.addon()`
// (a native module loader with no static shape TypeScript can see), and its
// only consumer (wavelength-transport-bare-native.js's invokeFacade) immediately
// casts each accessed method to `any` before calling it -- narrower,
// per-method signatures here wouldn't be enforced or verified against the
// real native binary, so they'd just be documentation-shaped guesses. This
// only needs to exist so builds that resolve the `wavelength-bare-addon`
// specifier import a real type instead of tsc falling through to inferring
// one from binding.js's `require.addon()` call, which its built-in `Require`
// type doesn't recognize.
declare const addon: Record<string, (...args: any[]) => any>
export = addon
