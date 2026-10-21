// react-native-bare-kit links the addons of the package it's installed under,
// which under npm workspaces is the repo root, not this app, so link them here.
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'
import link from 'bare-link'

const require = createRequire(import.meta.url)
const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const kit = path.dirname(require.resolve('react-native-bare-kit/package.json'))

const targets = [
  { hosts: ['ios-arm64', 'ios-arm64-simulator', 'ios-x64-simulator'], out: path.join(kit, 'ios', 'addons') },
  { hosts: ['android-arm64', 'android-arm', 'android-ia32', 'android-x64'], out: path.join(kit, 'android', 'src', 'main', 'addons') }
]

for (const opts of targets) {
  for await (const resource of link(app, opts)) console.log('Wrote', resource)
}
