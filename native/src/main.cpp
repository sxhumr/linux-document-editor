#include "shell.hpp"

#include <gtk/gtk.h>

#include <cstdlib>
#include <exception>
#include <iostream>

int main(int argc, char **argv) {
  if (gtk_init_check(&argc, &argv) == FALSE) {
    std::cerr << "PageLite needs a graphical session (GTK could not initialise).\n";
    return EXIT_FAILURE;
  }

  pagelite::ShellOptions options;
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
