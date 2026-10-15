#include "navigation.hpp"

namespace pagelite::navigation {

std::optional<std::string_view> origin_of(std::string_view uri) {
  const auto scheme_end = uri.find("://");
  if (scheme_end == std::string_view::npos || scheme_end == 0) {
    return std::nullopt;
  }
  const auto scheme = uri.substr(0, scheme_end);
  if (scheme != "http" && scheme != "https" && scheme != "pagelite") {
    return std::nullopt;
  }
  const auto host_start = scheme_end + 3;
  const auto host_end = uri.find_first_of("/?#", host_start);
  const auto authority = uri.substr(host_start, host_end - host_start);
  // Userinfo ("user@host") is a classic origin-spoofing trick; nothing legitimate uses it.
  if (authority.empty() || authority.find('@') != std::string_view::npos) {
    return std::nullopt;
  }
  return uri.substr(0, host_end == std::string_view::npos ? uri.size() : host_end);
}

bool is_allowed(std::string_view uri, std::optional<std::string_view> dev_server_url) {
  // Empty frames the UI creates itself inherit the app's origin; they carry no new content.
  if (uri == "about:blank" || uri == "about:srcdoc") {
    return true;
  }
  const auto origin = origin_of(uri);
  if (!origin) {
    return false;
  }
  if (*origin == kAppOrigin) {
    return true;
  }
  if (dev_server_url) {
    const auto dev_origin = origin_of(*dev_server_url);
    return dev_origin && *origin == *dev_origin;
  }
  return false;
}

} // namespace pagelite::navigation
