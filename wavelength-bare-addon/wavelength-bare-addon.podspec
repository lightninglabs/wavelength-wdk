require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'wavelength-bare-addon'
  s.version      = package['version']
  s.summary      = 'Vendors Wavewalletdk.xcframework, the daemon framework whose Mobile* functions this Bare native addon looks up at load time.'
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

  # The framework is a static library and nothing in the app calls its Mobile*
  # functions: only the addon looks them up when it loads. A Release link's
  # dead stripping would drop them and the app would abort at launch, so name
  # each one the addon needs as required. The list comes from the shipped
  # prebuild itself, so it always matches what the addon looks up.
  prebuild = Dir[File.join(__dir__, 'prebuilds', 'ios-arm64', '*.bare')].first
  if prebuild
    symbols = `nm -u "#{prebuild}"`.split.grep(/\A_Mobile/)
    s.user_target_xcconfig = { 'OTHER_LDFLAGS' => symbols.map { |sym| "-Wl,-u,#{sym}" }.join(' ') }
  end
end
