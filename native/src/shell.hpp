#pragma once

// The native shell: one GTK window hosting one WebKitGTK view (via webview/webview).
// It serves the embedded UI over the private pagelite:// scheme, refuses every other
// navigation, and routes window-close through the UI so unsaved edits are never dropped.

#include <memory>
#include <optional>
#include <string>

namespace pagelite {

struct ShellOptions {
  bool debug = false;
  /// Debug builds only: load the UI from a Vite dev server instead of the embedded copy.
  std::optional<std::string> dev_server_url;
};

class Shell {
public:
  explicit Shell(ShellOptions options);
  ~Shell();
  Shell(const Shell &) = delete;
  Shell &operator=(const Shell &) = delete;

  /// Runs the GTK main loop until the window is closed. Returns the process exit code.
  int run();

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace pagelite
