#include "file_dialogs.hpp"

#include <memory>
#include <utility>

namespace pagelite::dialogs {
namespace {

void add_filters(GtkFileChooser *chooser) {
  GtkFileFilter *docx = gtk_file_filter_new();
  gtk_file_filter_set_name(docx, "Word documents (*.docx)");
  gtk_file_filter_add_pattern(docx, "*.docx");
  gtk_file_filter_add_pattern(docx, "*.DOCX");
  gtk_file_filter_add_mime_type(
      docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  gtk_file_chooser_add_filter(chooser, docx); // the chooser takes ownership

  GtkFileFilter *any = gtk_file_filter_new();
  gtk_file_filter_set_name(any, "All files");
  gtk_file_filter_add_pattern(any, "*");
  gtk_file_chooser_add_filter(chooser, any);
}

/// Shows `dialog` without blocking and hands the result to `done` exactly once.
void run(GtkFileChooserNative *dialog, PathCallback done) {
  auto *callback = new PathCallback(std::move(done));
  g_signal_connect(dialog, "response",
                   G_CALLBACK(+[](GtkNativeDialog *self, gint response, gpointer data) {
                     std::unique_ptr<PathCallback> cb(static_cast<PathCallback *>(data));
                     std::optional<std::filesystem::path> path;
                     if (response == GTK_RESPONSE_ACCEPT) {
                       if (gchar *name = gtk_file_chooser_get_filename(GTK_FILE_CHOOSER(self))) {
                         path = name;
                         g_free(name);
                       }
                     }
                     g_object_unref(self);
                     (*cb)(std::move(path));
                   }),
                   callback);
  gtk_native_dialog_set_modal(GTK_NATIVE_DIALOG(dialog), TRUE);
  gtk_native_dialog_show(GTK_NATIVE_DIALOG(dialog));
}

} // namespace

void choose_document_to_open(GtkWindow *parent, PathCallback done) {
  GtkFileChooserNative *dialog = gtk_file_chooser_native_new(
      "Open Document", parent, GTK_FILE_CHOOSER_ACTION_OPEN, "_Open", "_Cancel");
  gtk_file_chooser_set_local_only(GTK_FILE_CHOOSER(dialog), TRUE);
  add_filters(GTK_FILE_CHOOSER(dialog));
  run(dialog, std::move(done));
}

void choose_save_path(GtkWindow *parent, const std::string &suggested_name,
                      const std::optional<std::filesystem::path> &folder, PathCallback done) {
  GtkFileChooserNative *dialog = gtk_file_chooser_native_new(
      "Save Document As", parent, GTK_FILE_CHOOSER_ACTION_SAVE, "_Save", "_Cancel");
  auto *chooser = GTK_FILE_CHOOSER(dialog);
  gtk_file_chooser_set_local_only(chooser, TRUE);
  gtk_file_chooser_set_do_overwrite_confirmation(chooser, TRUE);
  add_filters(chooser);
  if (folder) {
    gtk_file_chooser_set_current_folder(chooser, folder->c_str());
  }
  gtk_file_chooser_set_current_name(chooser, suggested_name.c_str());
  run(dialog, std::move(done));
}

} // namespace pagelite::dialogs
