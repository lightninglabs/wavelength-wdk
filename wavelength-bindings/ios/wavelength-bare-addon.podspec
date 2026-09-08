Pod::Spec.new do |s|
  s.name         = 'wavelength-bare-addon'
  s.version      = '0.0.1'
  s.summary      = 'Vendors Wavewalletdk.xcframework, the dynamic dependency this Bare native addon links against (see CMakeLists.txt).'
  s.homepage     = 'https://wavelength.lightning.engineering'
  s.license      = { :type => 'Apache-2.0' }
  s.author       = 'Lightning Labs'
  s.platforms    = { :ios => '15.1' }
  s.source       = { :path => '.' }

  # bare-link vendors the addon itself, but only walks addon-flagged npm
  # packages. Wavewalletdk is a plain gomobile xcframework, not a Bare
  # module, so nothing else embeds it. Without this the addon still links at
  # compile time (CMakeLists.txt's -framework Wavewalletdk resolves against
  # the local copy), but dyld has nothing to load at runtime and the first
  # daemon call crashes on an unresolved symbol.
  s.vendored_frameworks = 'Wavewalletdk.xcframework'

  # Wavewalletdk's Go runtime resolves DNS via libresolv (res_9_* symbols).
  # CMakeLists.txt links resolv into the addon's own build, but that does not
  # propagate to the final app-level link.
  s.libraries = 'resolv'
end
