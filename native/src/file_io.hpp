#pragma once

// Reading and safely writing whole documents. Platform-free apart from POSIX, so it is
// unit-tested directly (native/tests/file_io_test.cpp).

#include <cstddef>
#include <cstdint>
#include <expected>
#include <filesystem>
#include <span>
#include <string>
#include <vector>

namespace pagelite::file_io {

enum class ErrorCode : std::uint8_t {
  NotFound,
  PermissionDenied,
  IsDirectory,
  TooLarge,
  NoSpace,
  ReadOnlyFilesystem,
  DirectoryMissing,
  IoError,
};

struct Error {
  ErrorCode code;
  std::string message; // human-readable, includes the OS reason; never document content
};

/// Stable identifier for the UI ("not-found", "permission-denied", ...).
std::string_view code_name(ErrorCode code);

/// DOCX files beyond this are refused rather than read into memory.
inline constexpr std::size_t kMaxDocumentBytes = std::size_t{256} * 1024 * 1024;

/// Reads a whole regular file.
std::expected<std::vector<std::byte>, Error> read_file(const std::filesystem::path &path,
                                                       std::size_t max_bytes = kMaxDocumentBytes);

/// Replaces `path` with `bytes` so that, whatever happens, the file on disk is either the
/// complete old version or the complete new one:
///   1. write to a temporary file in the same directory,
///   2. fsync it,
///   3. rename it over `path` (atomic on POSIX filesystems),
///   4. fsync the directory so the rename itself survives a crash.
/// An existing file keeps its permission bits; a read-only file is refused rather than
/// replaced; a symlink is followed. On any failure the temporary file is removed and the
/// original is untouched.
std::expected<void, Error> write_file_atomic(const std::filesystem::path &requested,
                                             std::span<const std::byte> bytes);

/// "report" → "report.docx"; a name that already has an extension is left alone.
std::filesystem::path with_docx_extension(const std::filesystem::path &path);

} // namespace pagelite::file_io
