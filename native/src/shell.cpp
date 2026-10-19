#include "shell.hpp"

#include "assets.hpp"
#include "bridge_json.hpp"
#include "file_dialogs.hpp"
#include "file_io.hpp"
#include "navigation.hpp"
#include "path_grants.hpp"

#include <gtk/gtk.h>
#include <libsoup/soup.h>
#include <webkit2/webkit2.h>
#include <webview/webview.h>

#include <chrono>
#include <filesystem>
#include <iostream>
#include <memory>
#include <span>
#include <string>
#include <utility>
#include <vector>

#ifndef PAGELITE_VERSION
#error "PAGELITE_VERSION must be defined by the build"
#endif

namespace pagelite {
namespace {

constexpr int kDefaultWidth = 1100;
constexpr int kDefaultHeight = 820;
constexpr const char *kScheme = "pagelite";

// Everything the UI needs comes from pagelite://app itself. 'wasm-unsafe-eval' lets the
// engine compile its bundled HarfBuzz WebAssembly; nothing else may execute or connect out.
constexpr const char *kContentSecurityPolicy =
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'none'";

/// A positional argument of a webview binding call, which arrives as a JSON array.
std::string arg(const std::string &request, int index = 0) {
  return webview::detail::json_parse(request, "", index);
}

std::string to_base64(std::span<const std::byte> bytes) {
  gchar *encoded = g_base64_encode(reinterpret_cast<const guchar *>(bytes.data()), bytes.size());
  std::string out(encoded);
  g_free(encoded);
  return out;
}

std::vector<std::byte> from_base64(const std::string &text) {
  gsize size = 0;
  guchar *decoded = g_base64_decode(text.c_str(), &size);
  std::vector<std::byte> out(reinterpret_cast<std::byte *>(decoded),
                             reinterpret_cast<std::byte *>(decoded) + size);
  g_free(decoded);
  return out;
}

std::string error_json(const file_io::Error &e) {
  return bridge::error(file_io::code_name(e.code), e.message);
}

} // namespace

struct Shell::Impl {
  ShellOptions options;
  GtkWidget *window = nullptr;
  std::unique_ptr<webview::webview> view;
  bool ui_handles_close = false;
  bool close_confirmed = false;
  PathGrants grants;

  explicit Impl(ShellOptions opts) : options(std::move(opts)) {}

  // ---- pagelite:// scheme -----------------------------------------------------------

  static void serve(WebKitURISchemeRequest *request, gpointer /*user_data*/) {
    const std::string uri = webkit_uri_scheme_request_get_uri(request);
    const auto origin = navigation::origin_of(uri);
    const auto asset = origin && *origin == navigation::kAppOrigin
                           ? assets::find(webkit_uri_scheme_request_get_path(request))
                           : std::nullopt;
    if (!asset) {
      GError *error = g_error_new_literal(G_IO_ERROR, G_IO_ERROR_NOT_FOUND, "Not found");
      webkit_uri_scheme_request_finish_error(request, error);
      g_error_free(error);
      return;
    }
    // The bytes live in the binary's read-only data for the life of the process: no copy.
    GInputStream *stream = g_memory_input_stream_new_from_data(
        asset->bytes.data(), static_cast<gssize>(asset->bytes.size()), nullptr);
    WebKitURISchemeResponse *response =
        webkit_uri_scheme_response_new(stream, static_cast<gint64>(asset->bytes.size()));
    const std::string mime(asset->mime_type);
    SoupMessageHeaders *headers = soup_message_headers_new(SOUP_MESSAGE_HEADERS_RESPONSE);
    soup_message_headers_append(headers, "Content-Type", mime.c_str());
    soup_message_headers_append(headers, "Content-Security-Policy", kContentSecurityPolicy);
    soup_message_headers_append(headers, "X-Content-Type-Options", "nosniff");
    // Explicit headers replace the response's defaults, Content-Type included, so the type
    // is set in the header map and on the response after it.
    webkit_uri_scheme_response_set_http_headers(response, headers); // takes ownership
    webkit_uri_scheme_response_set_content_type(response, mime.c_str());
    webkit_uri_scheme_request_finish_with_response(request, response);
    g_object_unref(response);
    g_object_unref(stream);
  }

  static void register_scheme() {
    WebKitWebContext *context = webkit_web_context_get_default();
    webkit_web_context_register_uri_scheme(context, kScheme, &Impl::serve, nullptr, nullptr);
    WebKitSecurityManager *security = webkit_web_context_get_security_manager(context);
    // Secure + CORS-enabled so ES modules, workers and WebAssembly load as they would
    // over https; no access to file:// or the network is granted.
    webkit_security_manager_register_uri_scheme_as_secure(security, kScheme);
    webkit_security_manager_register_uri_scheme_as_cors_enabled(security, kScheme);
  }

  // ---- navigation lock-down ---------------------------------------------------------

  static gboolean on_decide_policy(WebKitWebView * /*web_view*/, WebKitPolicyDecision *decision,
                                   WebKitPolicyDecisionType type, gpointer data) {
    auto *self = static_cast<Impl *>(data);
    if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) {
      return FALSE; // default handling
    }
    if (type == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) {
      webkit_policy_decision_ignore(decision);
      return TRUE;
    }
    auto *nav = WEBKIT_NAVIGATION_POLICY_DECISION(decision);
    WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(nav);
    const char *uri = webkit_uri_request_get_uri(webkit_navigation_action_get_request(action));
    const auto dev = self->options.dev_server_url
                         ? std::optional<std::string_view>(*self->options.dev_server_url)
                         : std::nullopt;
    if (uri != nullptr && navigation::is_allowed(uri, dev)) {
      webkit_policy_decision_use(decision);
    } else {
      // Deliberately not logged: the URL may come from document content.
      webkit_policy_decision_ignore(decision);
    }
    return TRUE;
  }

  // ---- close protection -------------------------------------------------------------

  // The window never closes on its own. Once the UI has registered, it is asked first
  // and answers through pagelite_confirmClose; until then (or if the UI failed to load)
  // there is nothing to lose and the window closes directly.
  static gboolean on_delete_event(GtkWidget * /*widget*/, GdkEvent * /*event*/, gpointer data) {
    auto *self = static_cast<Impl *>(data);
    if (self->close_confirmed || !self->ui_handles_close) {
      self->view->terminate();
    } else {
      self->view->eval("window.__pagelite_requestClose && window.__pagelite_requestClose()");
    }
    return TRUE;
  }

  // ---- bindings (window.pagelite_* in the UI) ---------------------------------------

  void bind_api() {
    view->bind("pagelite_appInfo", [](const std::string &) {
      return std::string(R"({"name":"PageLite","version":")") + PAGELITE_VERSION +
             R"(","webkitVersion":")" + std::to_string(webkit_get_major_version()) + "." +
             std::to_string(webkit_get_minor_version()) + "." +
             std::to_string(webkit_get_micro_version()) + "\"}";
    });
    view->bind("pagelite_setTitle", [this](const std::string &request) {
      gtk_window_set_title(GTK_WINDOW(window), arg(request).c_str());
      return std::string("null");
    });
    view->bind("pagelite_registerCloseHandler", [this](const std::string &) {
      ui_handles_close = true;
      return std::string("null");
    });
    view->bind("pagelite_confirmClose", [this](const std::string &) {
      close_confirmed = true;
      view->terminate();
      return std::string("null");
    });
    bind_documents();
    if (options.measure_since) {
      bind_startup_marks();
    }
  }

  /// Timing mode: print each startup phase the UI reports, and quit after the last one
  /// (the opened document if one was named on the command line, otherwise the empty editor).
  void bind_startup_marks() {
    const std::string last_phase = options.initial_path ? "document-opened" : "ui-ready";
    view->bind("pagelite_mark", [this, last_phase](const std::string &request) {
      const std::string phase = arg(request);
      const std::chrono::duration<double, std::milli> since_main =
          std::chrono::steady_clock::now() - *options.measure_since;
      const auto unix_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                               std::chrono::system_clock::now().time_since_epoch())
                               .count();
      std::cerr << bridge::startup_mark(phase, since_main.count(), unix_ms) << '\n';
      if (phase == last_phase) {
        view->terminate();
      }
      return std::string("null");
    });
  }

  // ---- documents --------------------------------------------------------------------
  //
  // Paths are only ever chosen by the user (dialog or command line) and recorded in
  // `grants`; read and write requests for any other path are refused. Replies with
  // status 0 resolve the UI's promise, status 1 rejects it with {code, message}.

  void resolve(const std::string &id, const std::string &json) { view->resolve(id, 0, json); }
  void reject(const std::string &id, const std::string &json) { view->resolve(id, 1, json); }

  /// Reads a granted file and replies with {path, name, data}.
  void reply_with_document(const std::string &id, const std::filesystem::path &path) {
    const auto bytes = file_io::read_file(path);
    if (!bytes) {
      reject(id, error_json(bytes.error()));
      return;
    }
    resolve(id, bridge::document(path.string(), path.filename().string(), to_base64(*bytes)));
  }

  void bind_async(const std::string &name,
                  void (Impl::*handler)(const std::string &id, const std::string &request)) {
    view->bind(
        name,
        [this, handler](const std::string &id, const std::string &request, void *) {
          (this->*handler)(id, request);
        },
        nullptr);
  }

  void open_document(const std::string &id, const std::string & /*request*/) {
    dialogs::choose_document_to_open(GTK_WINDOW(window), [this, id](auto path) {
      if (!path) {
        resolve(id, "null"); // cancelled
        return;
      }
      grants.grant(*path);
      reply_with_document(id, *path);
    });
  }

  void take_initial_document(const std::string &id, const std::string & /*request*/) {
    if (!options.initial_path) {
      resolve(id, "null");
      return;
    }
    const std::filesystem::path path = *std::exchange(options.initial_path, std::nullopt);
    grants.grant(path);
    reply_with_document(id, path);
  }

  void choose_save_path(const std::string &id, const std::string &request) {
    const std::filesystem::path current = arg(request, 1);
    std::optional<std::filesystem::path> folder;
    if (grants.is_granted(current)) {
      folder = current.parent_path(); // only reveal folders the user already chose
    }
    dialogs::choose_save_path(GTK_WINDOW(window), arg(request, 0), folder, [this, id](auto path) {
      if (!path) {
        resolve(id, "null");
        return;
      }
      const auto target = file_io::with_docx_extension(*path);
      // GTK confirmed overwriting the name as typed, not the one with ".docx" added.
      std::error_code ec;
      if (target != *path && std::filesystem::exists(target, ec)) {
        reject(id, bridge::error("exists", target.filename().string() +
                                               " already exists. Choose another name, or "
                                               "type the full name to replace it."));
        return;
      }
      grants.grant(target);
      resolve(id, bridge::file_ref(target.string(), target.filename().string()));
    });
  }

  void write_document(const std::string &id, const std::string &request) {
    const std::filesystem::path path = arg(request, 0);
    if (!grants.is_granted(path)) {
      reject(id, bridge::error("not-granted", "PageLite can only save to a file you chose."));
      return;
    }
    const auto bytes = from_base64(arg(request, 1));
    if (const auto written = file_io::write_file_atomic(path, bytes); !written) {
      reject(id, error_json(written.error()));
      return;
    }
    resolve(id, "null");
  }

  void bind_documents() {
    bind_async("pagelite_openDocument", &Impl::open_document);
    bind_async("pagelite_takeInitialDocument", &Impl::take_initial_document);
    bind_async("pagelite_chooseSavePath", &Impl::choose_save_path);
    bind_async("pagelite_writeDocument", &Impl::write_document);
  }

  void create() {
    register_scheme(); // before the WebKitWebView exists, or its context misses the scheme

    window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "PageLite");
    gtk_window_set_default_size(GTK_WINDOW(window), kDefaultWidth, kDefaultHeight);
    gtk_window_set_icon_name(GTK_WINDOW(window), "pagelite");
    g_signal_connect(window, "delete-event", G_CALLBACK(&Impl::on_delete_event), this);

    view = std::make_unique<webview::webview>(options.debug, window);
    auto *web_view = WEBKIT_WEB_VIEW(view->browser_controller().value());
    g_signal_connect(web_view, "decide-policy", G_CALLBACK(&Impl::on_decide_policy), this);

    WebKitSettings *settings = webkit_web_view_get_settings(web_view);
    webkit_settings_set_allow_file_access_from_file_urls(settings, FALSE);
    webkit_settings_set_allow_universal_access_from_file_urls(settings, FALSE);
    webkit_settings_set_enable_developer_extras(settings, options.debug ? TRUE : FALSE);

    bind_api();
    view->navigate(options.dev_server_url.value_or(std::string(navigation::kAppEntry)));
    gtk_widget_show_all(window);
  }

  ~Impl() {
    view.reset(); // detaches the web view from the still-alive window
    if (window != nullptr) {
      gtk_widget_destroy(window);
    }
  }
};

Shell::Shell(ShellOptions options) : impl_(std::make_unique<Impl>(std::move(options))) {
  impl_->create();
}

Shell::~Shell() = default;

int Shell::run() {
  impl_->view->run();
  return 0;
}

} // namespace pagelite
