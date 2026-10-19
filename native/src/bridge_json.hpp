#pragma once

// JSON replies for the webview bindings. Hand-rolled because the shapes are tiny and
// fixed; escaping is the only subtle part, and it is unit-tested.

#include <cstdint>
#include <string>
#include <string_view>

namespace pagelite::bridge {

/// A JSON string literal, quotes included. Escapes quotes, backslashes and all control
/// characters, plus U+2028/U+2029 so the result is also safe inside JavaScript source.
std::string quote(std::string_view text);

/// {"path": ..., "name": ...}
std::string file_ref(std::string_view path, std::string_view name);

/// {"path": ..., "name": ..., "data": <base64>}
std::string document(std::string_view path, std::string_view name, std::string_view base64);

/// {"code": ..., "message": ...}; the UI turns this into a readable error.
std::string error(std::string_view code, std::string_view message);

/// One startup-timing line for scripts/measure.sh:
/// {"phase": ..., "sinceMainMs": <ms, 0.1 precision>, "unixMs": <wall clock ms>}
std::string startup_mark(std::string_view phase, double since_main_ms, std::int64_t unix_ms);

} // namespace pagelite::bridge
