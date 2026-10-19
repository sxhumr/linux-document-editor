#include "file_io.hpp"

#include <catch2/catch_test_macros.hpp>

#include <sys/stat.h>
#include <unistd.h>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;
using pagelite::file_io::ErrorCode;
using pagelite::file_io::read_file;
using pagelite::file_io::write_file_atomic;

namespace {

/// A fresh directory per test, removed afterwards.
struct TempDir {
  fs::path path;
  TempDir() {
    std::string tmpl = (fs::temp_directory_path() / "pagelite-test-XXXXXX").string();
    path = ::mkdtemp(tmpl.data());
  }
  ~TempDir() {
    std::error_code ec;
    fs::permissions(path, fs::perms::owner_all, fs::perm_options::add, ec);
    fs::remove_all(path, ec);
  }
  TempDir(const TempDir &) = delete;
  TempDir &operator=(const TempDir &) = delete;
};

std::vector<std::byte> bytes_of(const std::string &s) {
  std::vector<std::byte> out(s.size());
  for (std::size_t i = 0; i < s.size(); ++i) {
    out[i] = static_cast<std::byte>(s[i]);
  }
  return out;
}

std::string text_of(const fs::path &p) {
  std::ifstream in(p, std::ios::binary);
  return {std::istreambuf_iterator<char>(in), {}};
}

void write_text(const fs::path &p, const std::string &s) {
  std::ofstream(p, std::ios::binary) << s;
}

/// Permission checks are bypassed for root, so those cases are skipped there.
bool running_as_root() {
  return ::geteuid() == 0;
}

std::size_t entry_count(const fs::path &dir) {
  return static_cast<std::size_t>(std::distance(fs::directory_iterator(dir), {}));
}

} // namespace

TEST_CASE("read_file returns the exact bytes") {
  TempDir dir;
  const std::string content("PK\x03\x04 binary\0data", 17);
  write_text(dir.path / "a.docx", content);
  const auto result = read_file(dir.path / "a.docx");
  REQUIRE(result);
  CHECK(*result == bytes_of(content));
}

TEST_CASE("read_file reads an empty file") {
  TempDir dir;
  write_text(dir.path / "empty.docx", "");
  const auto result = read_file(dir.path / "empty.docx");
  REQUIRE(result);
  CHECK(result->empty());
}

TEST_CASE("read_file reports typed errors") {
  TempDir dir;
  SECTION("missing file") {
    const auto result = read_file(dir.path / "missing.docx");
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::NotFound);
  }
  SECTION("directory") {
    const auto result = read_file(dir.path);
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::IsDirectory);
  }
  SECTION("over the size limit") {
    write_text(dir.path / "big.docx", std::string(1000, 'x'));
    const auto result = read_file(dir.path / "big.docx", 999);
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::TooLarge);
  }
  SECTION("exactly at the size limit is fine") {
    write_text(dir.path / "edge.docx", std::string(999, 'x'));
    CHECK(read_file(dir.path / "edge.docx", 999));
  }
  SECTION("unreadable file") {
    if (running_as_root()) {
      SKIP("root bypasses permission checks");
    }
    write_text(dir.path / "secret.docx", "x");
    fs::permissions(dir.path / "secret.docx", fs::perms::none);
    const auto result = read_file(dir.path / "secret.docx");
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::PermissionDenied);
  }
}

TEST_CASE("write_file_atomic creates a new file") {
  TempDir dir;
  const auto target = dir.path / "new.docx";
  REQUIRE(write_file_atomic(target, bytes_of("hello")));
  CHECK(text_of(target) == "hello");
  CHECK(entry_count(dir.path) == 1); // no temporary file left behind
}

TEST_CASE("write_file_atomic replaces content and keeps permissions") {
  TempDir dir;
  const auto target = dir.path / "doc.docx";
  write_text(target, "old content that is longer");
  fs::permissions(target, fs::perms::owner_read | fs::perms::owner_write | fs::perms::group_read);

  REQUIRE(write_file_atomic(target, bytes_of("new")));
  CHECK(text_of(target) == "new");
  CHECK(fs::status(target).permissions() ==
        (fs::perms::owner_read | fs::perms::owner_write | fs::perms::group_read));
  CHECK(entry_count(dir.path) == 1);
}

TEST_CASE("write_file_atomic writes through a symlink") {
  TempDir dir;
  const auto real = dir.path / "real.docx";
  const auto link = dir.path / "link.docx";
  write_text(real, "old");
  fs::create_symlink(real, link);

  REQUIRE(write_file_atomic(link, bytes_of("new")));
  CHECK(fs::is_symlink(link));
  CHECK(text_of(real) == "new");
}

TEST_CASE("write_file_atomic fails safely") {
  TempDir dir;
  SECTION("missing folder") {
    const auto result = write_file_atomic(dir.path / "nope" / "a.docx", bytes_of("x"));
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::DirectoryMissing);
  }
  SECTION("target is a folder") {
    fs::create_directory(dir.path / "folder.docx");
    const auto result = write_file_atomic(dir.path / "folder.docx", bytes_of("x"));
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::IsDirectory);
  }
  SECTION("read-only file is not replaced") {
    if (running_as_root()) {
      SKIP("root bypasses permission checks");
    }
    const auto target = dir.path / "locked.docx";
    write_text(target, "original");
    fs::permissions(target, fs::perms::owner_read);
    const auto result = write_file_atomic(target, bytes_of("new"));
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::PermissionDenied);
    CHECK(text_of(target) == "original");
    CHECK(entry_count(dir.path) == 1);
  }
  SECTION("read-only folder leaves the original untouched") {
    if (running_as_root()) {
      SKIP("root bypasses permission checks");
    }
    const auto target = dir.path / "doc.docx";
    write_text(target, "original");
    fs::permissions(dir.path, fs::perms::owner_read | fs::perms::owner_exec);
    const auto result = write_file_atomic(target, bytes_of("new"));
    REQUIRE_FALSE(result);
    CHECK(result.error().code == ErrorCode::PermissionDenied);
    fs::permissions(dir.path, fs::perms::owner_all);
    CHECK(text_of(target) == "original");
    CHECK(entry_count(dir.path) == 1);
  }
}

TEST_CASE("write then read round-trips binary data") {
  TempDir dir;
  std::vector<std::byte> data(300000);
  for (std::size_t i = 0; i < data.size(); ++i) {
    data[i] = static_cast<std::byte>(i * 31 % 256);
  }
  REQUIRE(write_file_atomic(dir.path / "big.docx", data));
  const auto back = read_file(dir.path / "big.docx");
  REQUIRE(back);
  CHECK(*back == data);
}

TEST_CASE("with_docx_extension adds .docx only when there is no extension") {
  using pagelite::file_io::with_docx_extension;
  CHECK(with_docx_extension("/a/report") == fs::path("/a/report.docx"));
  CHECK(with_docx_extension("/a/report.docx") == fs::path("/a/report.docx"));
  CHECK(with_docx_extension("/a/report.DOCX") == fs::path("/a/report.DOCX"));
  CHECK(with_docx_extension("/a/notes.txt") == fs::path("/a/notes.txt"));
  CHECK(with_docx_extension("/a/.hidden") == fs::path("/a/.hidden.docx"));
}
