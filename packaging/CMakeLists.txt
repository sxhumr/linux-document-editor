# Install layout and the Debian package (ADR-10). Build the package with:
#   cmake --preset package && cmake --build --preset package && cpack --preset deb
include(GNUInstallDirs)

set(APP_ID "io.github.sxhumr.PageLite") # must match pagelite::kAppId (native/src/shell.hpp)

# ---- licence notices for everything the binary embeds -----------------------------------
find_program(NODE node REQUIRED)
set(NOTICES "${CMAKE_CURRENT_BINARY_DIR}/THIRD_PARTY_NOTICES.md")
add_custom_command(
  OUTPUT "${NOTICES}"
  COMMAND "${NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/third-party-notices.mjs"
          "${PROJECT_SOURCE_DIR}/ui" "${webview_SOURCE_DIR}/LICENSE" "${NOTICES}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/third-party-notices.mjs" "${PROJECT_SOURCE_DIR}/ui/package-lock.json"
  COMMENT "Collecting third-party licence notices"
  VERBATIM)
add_custom_target(third_party_notices ALL DEPENDS "${NOTICES}")

# ---- install ----------------------------------------------------------------------------
# 755 directories whatever the builder's umask (Debian policy; a 002 umask would give 775).
set(CMAKE_INSTALL_DEFAULT_DIRECTORY_PERMISSIONS
    OWNER_READ OWNER_WRITE OWNER_EXECUTE GROUP_READ GROUP_EXECUTE WORLD_READ WORLD_EXECUTE)
install(TARGETS pagelite RUNTIME DESTINATION "${CMAKE_INSTALL_BINDIR}")
install(FILES "${APP_ID}.desktop" DESTINATION "${CMAKE_INSTALL_DATADIR}/applications")
install(FILES "${APP_ID}.metainfo.xml" DESTINATION "${CMAKE_INSTALL_DATADIR}/metainfo")
install(FILES "${APP_ID}.svg" DESTINATION "${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps")
install(FILES copyright "${NOTICES}" DESTINATION "${CMAKE_INSTALL_DOCDIR}")

# ---- Debian package -----------------------------------------------------------------------
# Runtime dependencies (GTK 3, WebKitGTK 4.1, libc) are computed by dpkg-shlibdeps from the
# binary. The desktop database, icon cache and MIME cache are refreshed by the triggers that
# desktop-file-utils, hicolor-icon-theme and shared-mime-info install, so no maintainer
# scripts are needed.
set(CPACK_GENERATOR DEB)
set(CPACK_PACKAGE_NAME pagelite)
set(CPACK_PACKAGE_VENDOR "Sohum Ramouthar")
set(CPACK_PACKAGE_CONTACT "Sohum Ramouthar <sohumramouthar@gmail.com>")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "lightweight editor for Word (.docx) documents")
set(CPACK_PACKAGE_DESCRIPTION
    "PageLite opens, edits and saves Microsoft Word (.docx) files in a minimal window.\n\
It keeps document content it does not edit, such as comments, tracked changes,\n\
footnotes and fields, and works entirely offline.")
set(CPACK_PACKAGING_INSTALL_PREFIX /usr)
set(CPACK_STRIP_FILES ON)
set(CPACK_DEBIAN_FILE_NAME DEB-DEFAULT) # pagelite_<version>_<arch>.deb
set(CPACK_DEBIAN_PACKAGE_SECTION editors)
set(CPACK_DEBIAN_PACKAGE_PRIORITY optional)
set(CPACK_DEBIAN_PACKAGE_HOMEPAGE "https://github.com/sxhumr/linux-document-editor")
set(CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON)
set(CPACK_DEBIAN_PACKAGE_GENERATE_SHLIBS OFF)
include(CPack)
