#pragma once

// JSON replies for the webview bindings. Hand-rolled because the shapes are tiny and
// fixed; escaping is the only subtle part, and it is unit-tested.

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

} // namespace pagelite::bridge
