#include "assets.hpp"

#include <algorithm>
#include <array>
#include <string>
#include <utility>

namespace pagelite::assets {

std::optional<std::string> normalize_path(std::string_view request_path) {
  const auto cut = request_path.find_first_of("?#");
  if (cut != std::string_view::npos) {
    request_path = request_path.substr(0, cut);
  }
  if (request_path.empty() || request_path == "/") {
    return "/index.html";
  }
  if (request_path.front() != '/' || request_path.find_first_of("\\%") != std::string_view::npos) {
    return std::nullopt;
  }

  std::string_view rest = request_path.substr(1);
  while (true) {
    const auto slash = rest.find('/');
    const auto segment = rest.substr(0, slash);
    if (segment.empty() || segment == "." || segment == "..") {
      return std::nullopt;
    }
    if (slash == std::string_view::npos) {
      break;
    }
    rest = rest.substr(slash + 1);
  }
  return std::string(request_path);
}

std::string_view mime_type_for(std::string_view path) {
  static constexpr std::array<std::pair<std::string_view, std::string_view>, 13> kTypes{{
      {".html", "text/html"},
      {".js", "text/javascript"},
      {".mjs", "text/javascript"},
      {".css", "text/css"},
      {".json", "application/json"},
      {".wasm", "application/wasm"},
      {".svg", "image/svg+xml"},
      {".png", "image/png"},
      {".ico", "image/x-icon"},
      {".woff2", "font/woff2"},
      {".woff", "font/woff"},
      {".ttf", "font/ttf"},
      {".txt", "text/plain"},
  }};
  for (const auto &[ext, type] : kTypes) {
    if (path.ends_with(ext)) {
      return type;
    }
  }
  return "application/octet-stream";
}

std::span<const EmbeddedFile> all() {
  return {detail::kFiles, detail::kFileCount};
}

std::optional<Asset> find(std::string_view request_path) {
  const auto path = normalize_path(request_path);
  if (!path) {
    return std::nullopt;
  }
  const auto files = all();
  const auto it = std::lower_bound(
      files.begin(), files.end(), *path,
      [](const EmbeddedFile &f, const std::string &p) { return std::string_view(f.path) < p; });
  if (it == files.end() || std::string_view(it->path) != *path) {
    return std::nullopt;
  }
  const auto *begin = reinterpret_cast<const std::byte *>(it->begin);
  const auto size = static_cast<std::size_t>(it->end - it->begin);
  return Asset{{begin, size}, mime_type_for(*path)};
}

} // namespace pagelite::assets
