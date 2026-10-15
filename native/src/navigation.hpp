#pragma once

// Which URLs the webview may load. The UI is the only page that should ever run in the
// window: anything else (a link inside a document, a redirect) could call the native
// bindings, so it is refused rather than opened.

#include <optional>
#include <string_view>

namespace pagelite::navigation {

inline constexpr std::string_view kAppOrigin = "pagelite://app";
inline constexpr std::string_view kAppEntry = "pagelite://app/";

/// True if `uri` is the embedded app (pagelite://app/...) or, when given, a URL on the
/// development server's exact origin (scheme://host:port). about:blank and about:srcdoc
/// are allowed because frames the UI creates start there.
bool is_allowed(std::string_view uri, std::optional<std::string_view> dev_server_url);

/// "scheme://host[:port]" of an http(s) or pagelite URL, or nothing if it has none.
std::optional<std::string_view> origin_of(std::string_view uri);

} // namespace pagelite::navigation
