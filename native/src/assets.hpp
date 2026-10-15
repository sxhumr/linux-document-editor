#pragma once

// The built UI (ui/dist) is linked into the binary and served from memory, so PageLite
// needs no install-time file layout, no localhost server and no file:// access.

#include <cstddef>
#include <optional>
#include <span>
#include <string>
#include <string_view>

namespace pagelite::assets {

struct EmbeddedFile {
  const char *path; // "/index.html", "/assets/index-abc123.js", ...
  const unsigned char *begin;
  const unsigned char *end;
};

struct Asset {
  std::span<const std::byte> bytes;
  std::string_view mime_type;
};

/// Maps a request path to the canonical embedded path, or nothing if it is unsafe.
/// "/" and "" map to "/index.html"; query strings and fragments are dropped; any
/// "..", "." or empty segment, backslash, or percent-encoding is rejected outright
/// rather than normalised, because no Vite output path needs them.
std::optional<std::string> normalize_path(std::string_view request_path);

/// MIME type from the file extension; "application/octet-stream" if unknown.
/// Bare types only: WebKit compares a custom scheme's content type literally, so
/// "text/css; charset=utf-8" is rejected as a stylesheet. UTF-8 is the default anyway.
std::string_view mime_type_for(std::string_view path);

/// Looks up an embedded file by request path (normalised first).
std::optional<Asset> find(std::string_view request_path);

/// Every embedded file, sorted by path.
std::span<const EmbeddedFile> all();

namespace detail {
// Defined by the generated assets_index.cpp, whose size is only known at build time.
extern const EmbeddedFile kFiles[]; // NOLINT(modernize-avoid-c-arrays)
extern const std::size_t kFileCount;
} // namespace detail

} // namespace pagelite::assets
