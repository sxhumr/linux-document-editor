#pragma once

// The native shell: one GTK window hosting one WebKitGTK view (via webview/webview).
// It serves the embedded UI over the private pagelite:// scheme, refuses every other
// navigation, and routes window-close through the UI so unsaved edits are never dropped.

#include <chrono>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>

namespace pagelite {

struct ShellOptions {
  bool debug = false;
  /// Debug builds only: load the UI from a Vite dev server instead of the embedded copy.
  std::optional<std::string> dev_server_url;
  /// A document given on the command line, opened once the UI asks for it.
  std::optional<std::filesystem::path> initial_path;
  /// Startup timing mode (PAGELITE_MEASURE=1): when main() started. The shell then prints
  /// one JSON line per startup phase to stderr and quits after the last one.
  std::optional<std::chrono::steady_clock::time_point> measure_since;
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
