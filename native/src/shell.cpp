#include "shell.hpp"

#include "assets.hpp"
#include "navigation.hpp"

#include <gtk/gtk.h>
#include <libsoup/soup.h>
#include <webkit2/webkit2.h>
#include <webview/webview.h>

#include <string>
#include <utility>

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

/// The first positional argument of a webview binding call, which arrives as a JSON array.
std::string first_arg(const std::string &request) {
  return webview::detail::json_parse(request, "", 0);
}

} // namespace

struct Shell::Impl {
  ShellOptions options;
  GtkWidget *window = nullptr;
  std::unique_ptr<webview::webview> view;
  bool ui_handles_close = false;
  bool close_confirmed = false;

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
      gtk_window_set_title(GTK_WINDOW(window), first_arg(request).c_str());
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
