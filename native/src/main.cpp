#include "shell.hpp"

#include <gtk/gtk.h>

#include <chrono>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <iostream>

int main(int argc, char **argv) {
  const auto started = std::chrono::steady_clock::now();
  if (gtk_init_check(&argc, &argv) == FALSE) {
    std::cerr << "PageLite needs a graphical session (GTK could not initialise).\n";
    return EXIT_FAILURE;
  }

  pagelite::ShellOptions options;
  if (const char *measure = std::getenv("PAGELITE_MEASURE");
      measure != nullptr && *measure == '1') {
    options.measure_since = started; // see scripts/measure.sh
  }
  if (argc > 1) {
    std::error_code ec;
    const auto path = std::filesystem::absolute(argv[1], ec);
    options.initial_path = ec ? std::filesystem::path(argv[1]) : path;
  }
#ifdef PAGELITE_DEBUG
  options.debug = true;
  if (const char *url = std::getenv("PAGELITE_DEV_SERVER"); url != nullptr && *url != '\0') {
    options.dev_server_url = url; // e.g. http://localhost:5173 while running `npm run dev`
  }
#endif

  try {
    pagelite::Shell shell(options);
    return shell.run();
  } catch (const std::exception &e) {
    std::cerr << "PageLite failed to start: " << e.what() << '\n';
    return EXIT_FAILURE;
  }
}
