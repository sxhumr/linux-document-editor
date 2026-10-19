#include "navigation.hpp"

#include <catch2/catch_test_macros.hpp>

#include <optional>
#include <string_view>

using pagelite::navigation::is_allowed;
using pagelite::navigation::origin_of;

namespace {
constexpr std::optional<std::string_view> kNoDev = std::nullopt;
}

TEST_CASE("the embedded app is allowed") {
  CHECK(is_allowed("pagelite://app/", kNoDev));
  CHECK(is_allowed("pagelite://app/index.html", kNoDev));
  CHECK(is_allowed("pagelite://app", kNoDev));
}

TEST_CASE("frames the UI creates are allowed") {
  CHECK(is_allowed("about:blank", kNoDev));
  CHECK(is_allowed("about:srcdoc", kNoDev));
}

TEST_CASE("everything else is refused") {
  CHECK_FALSE(is_allowed("https://example.com/", kNoDev));
  CHECK_FALSE(is_allowed("http://localhost:5173/", kNoDev));
  CHECK_FALSE(is_allowed("file:///etc/passwd", kNoDev));
  CHECK_FALSE(is_allowed("pagelite://other/", kNoDev));
  CHECK_FALSE(is_allowed("pagelite://app.evil.com/", kNoDev));
  CHECK_FALSE(is_allowed("pagelite://app@evil.com/", kNoDev));
  CHECK_FALSE(is_allowed("javascript:alert(1)", kNoDev));
  CHECK_FALSE(is_allowed("data:text/html,hi", kNoDev));
  CHECK_FALSE(is_allowed("about:config", kNoDev));
  CHECK_FALSE(is_allowed("", kNoDev));
}

TEST_CASE("the dev server is allowed only on its exact origin") {
  const std::optional<std::string_view> dev = "http://localhost:5173";
  CHECK(is_allowed("http://localhost:5173/", dev));
  CHECK(is_allowed("http://localhost:5173/src/main.tsx", dev));
  CHECK_FALSE(is_allowed("http://localhost:5174/", dev));
  CHECK_FALSE(is_allowed("https://localhost:5173/", dev));
  CHECK_FALSE(is_allowed("http://localhost:5173.evil.com/", dev));
  CHECK(is_allowed("pagelite://app/", dev));
}

TEST_CASE("origin_of extracts scheme and authority") {
  CHECK(origin_of("https://example.com/a?b#c") == "https://example.com");
  CHECK(origin_of("http://localhost:5173") == "http://localhost:5173");
  CHECK(origin_of("pagelite://app/index.html") == "pagelite://app");
  CHECK_FALSE(origin_of("about:blank"));
  CHECK_FALSE(origin_of("ftp://example.com/"));
  CHECK_FALSE(origin_of("https:///nohost"));
}
