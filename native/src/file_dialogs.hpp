#pragma once

// Non-blocking GTK file dialogs. GtkFileChooserNative uses the XDG desktop portal when
// available (Flatpak/Snap-friendly) and the GTK dialog otherwise.

#include <filesystem>
#include <functional>
#include <optional>
#include <string>

#include <gtk/gtk.h>

namespace pagelite::dialogs {

/// Called once with the chosen path, or nothing if the user cancelled.
using PathCallback = std::function<void(std::optional<std::filesystem::path>)>;

void choose_document_to_open(GtkWindow *parent, PathCallback done);

/// `suggested_name` pre-fills the name field; `folder` (if any) is where the dialog opens.
/// GTK asks before overwriting an existing file.
void choose_save_path(GtkWindow *parent, const std::string &suggested_name,
                      const std::optional<std::filesystem::path> &folder, PathCallback done);

} // namespace pagelite::dialogs
