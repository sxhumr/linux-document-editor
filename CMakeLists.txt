cmake_minimum_required(VERSION 3.25) # FetchContent SYSTEM

project(pagelite
  VERSION 0.1.0
  DESCRIPTION "Lightweight Linux DOCX editor"
  LANGUAGES C CXX ASM)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(PAGELITE_BUILD_TESTS "Build the C++ unit tests" ON)
option(PAGELITE_BUILD_UI "Run the UI build (npm) as part of the CMake build" ON)

include(FetchContent)

# webview/webview 0.12.0 (MIT), pinned to the release commit. Only the header is used:
# PageLite drives the GTK/WebKitGTK backend itself and passes in its own window.
FetchContent_Declare(webview
  GIT_REPOSITORY https://github.com/webview/webview.git
  GIT_TAG 3ab4b5d722438fc8a13e6ca830c5e2372d19a01d # 0.12.0
  GIT_SHALLOW FALSE
  SYSTEM) # third-party: do not apply PageLite's warning flags to its header
set(WEBVIEW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_DOCS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_SHARED_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_BUILD_STATIC_LIBRARY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_CLANG_FORMAT OFF CACHE BOOL "" FORCE)
set(WEBVIEW_ENABLE_CLANG_TIDY OFF CACHE BOOL "" FORCE)
set(WEBVIEW_INSTALL_TARGETS OFF CACHE BOOL "" FORCE)
set(WEBVIEW_WEBKITGTK_API 4.1 CACHE STRING "" FORCE) # GTK 3 + libsoup 3 (Ubuntu 22.04+)
FetchContent_MakeAvailable(webview)

if(PAGELITE_BUILD_TESTS)
  enable_testing()
endif()

add_subdirectory(native)
