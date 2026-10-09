cmake_minimum_required(VERSION 3.20)
project(openmusic_windows LANGUAGES CXX)

# ---------------------------------------------------------------------------
# OpenMusic — Windows host
#
# VERIFICATION STATUS: NOT COMPILED.
# The development machine has no MSVC toolchain, so nothing in this directory
# has been built. See ../docs/platform-capability-matrix.md.
#
# Decision required before this is built: which Lynx desktop embedding surface
# to target. Lynx 3.7 open-sourced macOS/Windows as first-class platforms, but
# element-attribute coverage is 73% (179/246) and is still moving. That is an
# architecture decision, not an implementation detail — see ADR-0001.
# ---------------------------------------------------------------------------

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(OPENMUSIC_LYNX_VENDOR "Path to a vendored Lynx source tree" "")

if(NOT OPENMUSIC_LYNX_VENDOR)
    message(FATAL_ERROR
        "OPENMUSIC_LYNX_VENDOR is not set.\n"
        "Clone https://github.com/lynx-family/lynx and point this at it, or use a "
        "prebuilt SDK. Do not guess the Lynx desktop embedding API — verify it first.")
endif()

add_executable(openmusic
    src/main.cpp
    src/window.cpp
    src/smtc_bridge.cpp
    src/file_picker.cpp
)

target_include_directories(openmusic PRIVATE
    ${OPENMUSIC_LYNX_VENDOR}/core
    ${OPENMUSIC_LYNX_VENDOR}/third_party
    src
)

target_link_libraries(openmusic PRIVATE
    user32
    shell32
    ole32
    shlwapi
)

set_property(TARGET openmusic PROPERTY WIN32_EXECUTABLE TRUE)