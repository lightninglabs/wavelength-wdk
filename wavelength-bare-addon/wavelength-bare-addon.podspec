Pod::Spec.new do |s|
  s.name         = 'wavelength-bare-addon'
  s.version      = '0.0.1'
  s.summary      = 'Vendors Wavewalletdk.xcframework, the dynamic dependency this Bare native addon links against (see CMakeLists.txt).'
  s.homepage     = 'https://wavelength.lightning.engineering'
  s.license      = { :type => 'MIT' }
  s.author       = 'Lightning Labs'
  s.platforms    = { :ios => '15.1' }
  s.source       = { :path => '.' }

  # bare-link only walks addon-flagged npm packages, so nothing else embeds
  # this plain gomobile xcframework. Without it the addon links but dyld has
  # nothing to load, and the first daemon call crashes on an unresolved symbol.
  s.vendored_frameworks = 'Wavewalletdk.xcframework'

  # The addon's own resolv link (CMakeLists.txt) does not propagate to the
  # app-level link.
  s.libraries = 'resolv'
end
