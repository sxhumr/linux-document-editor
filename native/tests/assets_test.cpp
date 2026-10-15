#include "assets.hpp"

#include <catch2/catch_test_macros.hpp>

#include <string>

// A stand-in for the generated table, so lookup is tested without building the UI.
namespace {
const unsigned char kIndex[] = "<!doctype html>";
const unsigned char kScript[] = "console.log(1)";
} // namespace

namespace pagelite::assets::detail {
const EmbeddedFile kFiles[] = {
    {"/assets/index-abc.js", kScript, kScript + sizeof(kScript) - 1},
    {"/index.html", kIndex, kIndex + sizeof(kIndex) - 1},
};
const std::size_t kFileCount = 2;
} // namespace pagelite::assets::detail

using pagelite::assets::find;
using pagelite::assets::mime_type_for;
using pagelite::assets::normalize_path;

TEST_CASE("root and empty paths serve index.html") {
  CHECK(normalize_path("/") == "/index.html");
  CHECK(normalize_path("") == "/index.html");
  CHECK(normalize_path("/?q=1") == "/index.html");
}

TEST_CASE("query strings and fragments are dropped") {
  CHECK(normalize_path("/assets/a.js?v=2") == "/assets/a.js");
  CHECK(normalize_path("/assets/a.js#x") == "/assets/a.js");
}

TEST_CASE("traversal and ambiguous paths are rejected, not normalised") {
  CHECK_FALSE(normalize_path("/../etc/passwd"));
  CHECK_FALSE(normalize_path("/assets/../index.html"));
  CHECK_FALSE(normalize_path("/./index.html"));
  CHECK_FALSE(normalize_path("//index.html"));
  CHECK_FALSE(normalize_path("/assets/"));
  CHECK_FALSE(normalize_path("/%2e%2e/secret"));
  CHECK_FALSE(normalize_path("/assets\\a.js"));
  CHECK_FALSE(normalize_path("index.html"));
}

TEST_CASE("MIME types come from the extension") {
  CHECK(mime_type_for("/index.html") == "text/html");
  CHECK(mime_type_for("/a/b.js") == "text/javascript");
  CHECK(mime_type_for("/x.wasm") == "application/wasm");
  CHECK(mime_type_for("/x.css") == "text/css");
  CHECK(mime_type_for("/x.unknown") == "application/octet-stream");
  CHECK(mime_type_for("/noextension") == "application/octet-stream");
}

TEST_CASE("find returns embedded bytes and type") {
  const auto index = find("/");
  REQUIRE(index);
  CHECK(std::string(reinterpret_cast<const char *>(index->bytes.data()), index->bytes.size()) ==
        "<!doctype html>");
  CHECK(index->mime_type == "text/html");

  const auto script = find("/assets/index-abc.js?x");
  REQUIRE(script);
  CHECK(script->bytes.size() == sizeof(kScript) - 1);
}

TEST_CASE("find misses unknown and unsafe paths") {
  CHECK_FALSE(find("/missing.js"));
  CHECK_FALSE(find("/assets/../index.html"));
  CHECK_FALSE(find("/assets/index-abc.j"));
}
