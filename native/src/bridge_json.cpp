#include "bridge_json.hpp"

#include <array>
#include <cstdio>
#include <format>

namespace pagelite::bridge {

std::string quote(std::string_view text) {
  std::string out;
  out.reserve(text.size() + 2);
  out += '"';
  for (std::size_t i = 0; i < text.size(); ++i) {
    const auto c = static_cast<unsigned char>(text[i]);
    switch (c) {
    case '"':
      out += "\\\"";
      break;
    case '\\':
      out += "\\\\";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      if (c < 0x20) {
        std::array<char, 8> buf{};
        (void)std::snprintf(buf.data(), buf.size(), "\\u%04x", c);
        out += buf.data();
      } else if (c == 0xE2 && i + 2 < text.size() &&
                 static_cast<unsigned char>(text[i + 1]) == 0x80 &&
                 (static_cast<unsigned char>(text[i + 2]) == 0xA8 ||
                  static_cast<unsigned char>(text[i + 2]) == 0xA9)) {
        // U+2028 / U+2029 are valid in JSON but end a line in older JavaScript parsers.
        out += static_cast<unsigned char>(text[i + 2]) == 0xA8 ? "\\u2028" : "\\u2029";
        i += 2;
      } else {
        out += static_cast<char>(c);
      }
    }
  }
  out += '"';
  return out;
}

std::string file_ref(std::string_view path, std::string_view name) {
  return R"({"path":)" + quote(path) + R"(,"name":)" + quote(name) + "}";
}

std::string document(std::string_view path, std::string_view name, std::string_view base64) {
  return R"({"path":)" + quote(path) + R"(,"name":)" + quote(name) + R"(,"data":)" + quote(base64) +
         "}";
}

std::string error(std::string_view code, std::string_view message) {
  return R"({"code":)" + quote(code) + R"(,"message":)" + quote(message) + "}";
}

std::string startup_mark(std::string_view phase, double since_main_ms, std::int64_t unix_ms) {
  return std::format(R"({{"phase":{},"sinceMainMs":{:.1f},"unixMs":{}}})", quote(phase),
                     since_main_ms, unix_ms);
}

} // namespace pagelite::bridge
