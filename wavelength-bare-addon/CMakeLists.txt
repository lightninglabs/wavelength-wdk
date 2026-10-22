cmake_minimum_required(VERSION 3.25)

# npm workspaces hoist the build tools to the repo root's node_modules, so look
# there as well as in this package's own.
foreach(modules "${CMAKE_CURRENT_SOURCE_DIR}/node_modules" "${CMAKE_CURRENT_SOURCE_DIR}/../node_modules")
  list(APPEND CMAKE_PREFIX_PATH "${modules}/cmake-bare" "${modules}/cmake-npm")
endforeach()

find_package(cmake-bare REQUIRED)

project(wavelength_bare_addon)

enable_language(OBJCXX)

add_bare_module(wavelength_bare_addon)

target_sources(
  ${wavelength_bare_addon}
  PRIVATE
    binding.mm
)

set(WAVEWALLETDK_XCFRAMEWORK "${CMAKE_CURRENT_SOURCE_DIR}/Wavewalletdk.xcframework")

if(CMAKE_OSX_SYSROOT MATCHES "iphonesimulator")
  set(WAVEWALLETDK_SLICE_DIR "${WAVEWALLETDK_XCFRAMEWORK}/ios-arm64_x86_64-simulator")
else()
  set(WAVEWALLETDK_SLICE_DIR "${WAVEWALLETDK_XCFRAMEWORK}/ios-arm64")
endif()

target_include_directories(
  ${wavelength_bare_addon}
  PRIVATE
    "${WAVEWALLETDK_SLICE_DIR}/Wavewalletdk.framework/Headers"
)

# The Go runtime's DNS resolver needs libresolv (res_9_* symbols).
target_link_libraries(
  ${wavelength_bare_addon}
  PRIVATE
    resolv
)

target_link_options(
  ${wavelength_bare_addon}
  PRIVATE
    "-F${WAVEWALLETDK_SLICE_DIR}"
    "-framework" "Wavewalletdk"
)
