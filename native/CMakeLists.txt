find_package(PkgConfig REQUIRED)
pkg_check_modules(GTK3 REQUIRED IMPORTED_TARGET gtk+-3.0)
pkg_check_modules(WEBKIT REQUIRED IMPORTED_TARGET webkit2gtk-4.1)

set(PAGELITE_WARNINGS -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wsign-conversion)

# ---- pagelite_core: platform-free logic, unit-tested without GTK ----------------------
add_library(pagelite_core STATIC
  src/assets.cpp
  src/navigation.cpp)
target_include_directories(pagelite_core PUBLIC src)
target_compile_options(pagelite_core PRIVATE ${PAGELITE_WARNINGS})

# ---- UI build + embedding -------------------------------------------------------------
set(UI_DIR "${PROJECT_SOURCE_DIR}/ui")
set(UI_DIST "${UI_DIR}/dist")
set(UI_STAMP "${CMAKE_CURRENT_BINARY_DIR}/ui-build.stamp")
set(EMBED_DIR "${CMAKE_CURRENT_BINARY_DIR}/embedded")
file(MAKE_DIRECTORY "${EMBED_DIR}")

if(PAGELITE_BUILD_UI)
  find_program(NPM npm REQUIRED)
  file(GLOB_RECURSE UI_SOURCES CONFIGURE_DEPENDS
    "${UI_DIR}/src/*" "${UI_DIR}/index.html" "${UI_DIR}/package.json"
    "${UI_DIR}/package-lock.json" "${UI_DIR}/vite.config.ts" "${UI_DIR}/tsconfig*.json")
  add_custom_command(
    OUTPUT "${UI_STAMP}"
    COMMAND "${NPM}" run build
    COMMAND "${CMAKE_COMMAND}" -E touch "${UI_STAMP}"
    WORKING_DIRECTORY "${UI_DIR}"
    DEPENDS ${UI_SOURCES}
    COMMENT "Building UI (npm run build)"
    VERBATIM)
else()
  # CI or packaging may build the UI separately; just require that it exists.
  add_custom_command(
    OUTPUT "${UI_STAMP}"
    COMMAND "${CMAKE_COMMAND}" -E touch "${UI_STAMP}"
    DEPENDS "${UI_DIST}/index.html"
    VERBATIM)
endif()

add_custom_command(
  OUTPUT "${EMBED_DIR}/assets_blob.S" "${EMBED_DIR}/assets_index.cpp"
  COMMAND "${CMAKE_COMMAND}" -DASSET_DIR=${UI_DIST} -DOUT_DIR=${EMBED_DIR}
          -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed_assets.cmake"
  DEPENDS "${UI_STAMP}" "${CMAKE_CURRENT_SOURCE_DIR}/cmake/embed_assets.cmake"
  COMMENT "Embedding UI assets"
  VERBATIM)
# .incbin reads files the build system cannot see; re-assemble whenever the UI rebuilds.
set_source_files_properties("${EMBED_DIR}/assets_blob.S" PROPERTIES OBJECT_DEPENDS "${UI_STAMP}")

# ---- the application ------------------------------------------------------------------
add_executable(pagelite
  src/main.cpp
  src/shell.cpp
  "${EMBED_DIR}/assets_index.cpp"
  "${EMBED_DIR}/assets_blob.S")
target_compile_definitions(pagelite PRIVATE
  PAGELITE_VERSION="${PROJECT_VERSION}"
  $<$<CONFIG:Debug>:PAGELITE_DEBUG>)
target_compile_options(pagelite PRIVATE $<$<COMPILE_LANGUAGE:CXX>:${PAGELITE_WARNINGS}>)
target_link_libraries(pagelite PRIVATE pagelite_core webview::core PkgConfig::GTK3 PkgConfig::WEBKIT)

# ---- tests ----------------------------------------------------------------------------
if(PAGELITE_BUILD_TESTS)
  FetchContent_Declare(Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.16.0
    GIT_SHALLOW TRUE
    SYSTEM)
  FetchContent_MakeAvailable(Catch2)
  include(Catch)

  add_executable(pagelite_tests
    tests/assets_test.cpp
    tests/navigation_test.cpp)
  target_compile_options(pagelite_tests PRIVATE ${PAGELITE_WARNINGS})
  target_link_libraries(pagelite_tests PRIVATE pagelite_core Catch2::Catch2WithMain)
  catch_discover_tests(pagelite_tests)
endif()
