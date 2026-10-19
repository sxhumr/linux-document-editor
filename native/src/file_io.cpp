#include "file_io.hpp"

#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <string_view>
#include <utility>

namespace pagelite::file_io {
namespace {

/// Closes a file descriptor on scope exit.
class Fd {
public:
  explicit Fd(int fd) : fd_(fd) {}
  ~Fd() {
    if (fd_ >= 0) {
      ::close(fd_);
    }
  }
  Fd(const Fd &) = delete;
  Fd &operator=(const Fd &) = delete;
  [[nodiscard]] int get() const { return fd_; }
  /// Closes now and reports failure (close can surface deferred write errors).
  int close() { return ::close(std::exchange(fd_, -1)); }

private:
  int fd_;
};

ErrorCode code_for_errno(int err) {
  switch (err) {
  case ENOENT:
    return ErrorCode::NotFound;
  case EACCES:
  case EPERM:
    return ErrorCode::PermissionDenied;
  case EISDIR:
    return ErrorCode::IsDirectory;
  case ENOSPC:
  case EDQUOT:
    return ErrorCode::NoSpace;
  case EROFS:
    return ErrorCode::ReadOnlyFilesystem;
  case EFBIG:
    return ErrorCode::TooLarge;
  default:
    return ErrorCode::IoError;
  }
}

Error os_error(std::string_view action, const std::filesystem::path &path, int err) {
  return {code_for_errno(err),
          std::string(action) + " " + path.string() + ": " + std::strerror(err)};
}

/// read(2), retrying when a signal interrupts it. Returns -1 (with errno) only for real errors.
ssize_t read_some(int fd, std::byte *buffer, std::size_t size) {
  while (true) {
    const ssize_t n = ::read(fd, buffer, size);
    if (n >= 0 || errno != EINTR) {
      return n;
    }
  }
}

/// write(2) until done, retrying on EINTR and short writes.
bool write_all(int fd, std::span<const std::byte> bytes) {
  while (!bytes.empty()) {
    const ssize_t n = ::write(fd, bytes.data(), bytes.size());
    if (n < 0) {
      if (errno == EINTR) {
        continue;
      }
      return false;
    }
    bytes = bytes.subspan(static_cast<std::size_t>(n));
  }
  return true;
}

} // namespace

std::string_view code_name(ErrorCode code) {
  switch (code) {
  case ErrorCode::NotFound:
    return "not-found";
  case ErrorCode::PermissionDenied:
    return "permission-denied";
  case ErrorCode::IsDirectory:
    return "is-directory";
  case ErrorCode::TooLarge:
    return "too-large";
  case ErrorCode::NoSpace:
    return "no-space";
  case ErrorCode::ReadOnlyFilesystem:
    return "read-only-filesystem";
  case ErrorCode::DirectoryMissing:
    return "directory-missing";
  case ErrorCode::IoError:
    return "io-error";
  }
  return "io-error";
}

std::expected<std::vector<std::byte>, Error> read_file(const std::filesystem::path &path,
                                                       std::size_t max_bytes) {
  Fd fd(::open(path.c_str(), O_RDONLY | O_CLOEXEC));
  if (fd.get() < 0) {
    return std::unexpected(os_error("Cannot open", path, errno));
  }
  struct stat st {};
  if (::fstat(fd.get(), &st) != 0) {
    return std::unexpected(os_error("Cannot read", path, errno));
  }
  if (S_ISDIR(st.st_mode)) {
    return std::unexpected(Error{ErrorCode::IsDirectory, path.string() + " is a folder"});
  }
  if (!S_ISREG(st.st_mode)) {
    return std::unexpected(Error{ErrorCode::IoError, path.string() + " is not a regular file"});
  }
  if (static_cast<std::uintmax_t>(st.st_size) > max_bytes) {
    return std::unexpected(Error{
        ErrorCode::TooLarge, path.string() + " is larger than " +
                                 std::to_string(max_bytes / (std::size_t{1024} * 1024)) + " MB"});
  }

  std::vector<std::byte> bytes(static_cast<std::size_t>(st.st_size));
  std::size_t filled = 0;
  while (true) {
    if (filled == bytes.size()) {
      // The file may have grown since fstat; read until EOF, still within the limit.
      if (bytes.size() >= max_bytes) {
        std::byte probe{};
        const ssize_t extra = read_some(fd.get(), &probe, 1);
        if (extra < 0) {
          return std::unexpected(os_error("Cannot read", path, errno));
        }
        if (extra == 0) {
          break;
        }
        return std::unexpected(Error{ErrorCode::TooLarge, path.string() + " grew while reading"});
      }
      bytes.resize(std::min(max_bytes, bytes.size() + std::size_t{64} * 1024));
    }
    const ssize_t n = read_some(fd.get(), bytes.data() + filled, bytes.size() - filled);
    if (n < 0) {
      return std::unexpected(os_error("Cannot read", path, errno));
    }
    if (n == 0) {
      break;
    }
    filled += static_cast<std::size_t>(n);
  }
  bytes.resize(filled);
  return bytes;
}

std::expected<void, Error> write_file_atomic(const std::filesystem::path &requested,
                                             std::span<const std::byte> bytes) {
  // Saving through a symlink updates the file it points to instead of replacing the link.
  // (is_symlink reports ENOENT for a file that does not exist yet; that just means "no".)
  std::error_code ec;
  const bool is_link = std::filesystem::is_symlink(requested, ec);
  ec.clear();
  const std::filesystem::path path =
      is_link ? std::filesystem::canonical(requested, ec) : requested;
  if (ec) {
    return std::unexpected(os_error("Cannot resolve", requested, ec.value()));
  }
  const std::filesystem::path dir = path.has_parent_path() ? path.parent_path() : ".";
  struct stat dir_st {};
  if (::stat(dir.c_str(), &dir_st) != 0 || !S_ISDIR(dir_st.st_mode)) {
    return std::unexpected(
        Error{ErrorCode::DirectoryMissing, "The folder " + dir.string() + " does not exist"});
  }

  // New files get the usual 0666 & ~umask; replaced files keep their own mode.
  struct stat existing {};
  const bool replacing = ::stat(path.c_str(), &existing) == 0;
  if (replacing && S_ISDIR(existing.st_mode)) {
    return std::unexpected(Error{ErrorCode::IsDirectory, path.string() + " is a folder"});
  }
  // rename() only needs a writable folder, so it would quietly replace a read-only file.
  if (replacing && ::access(path.c_str(), W_OK) != 0) {
    return std::unexpected(os_error("Cannot overwrite", path, errno));
  }

  // Hidden temporary name next to the target, so the final rename never crosses filesystems.
  std::string tmp_template = (dir / ("." + path.filename().string() + ".XXXXXX")).string();
  Fd fd(::mkstemp(tmp_template.data()));
  if (fd.get() < 0) {
    return std::unexpected(os_error("Cannot write to", dir, errno));
  }
  const std::filesystem::path tmp = tmp_template;
  auto fail = [&](std::string_view action, const std::filesystem::path &subject) {
    const int err = errno;
    ::unlink(tmp.c_str());
    return std::unexpected(os_error(action, subject, err));
  };

  mode_t mode = 0;
  if (replacing) {
    mode = existing.st_mode & 07777;
  } else {
    const mode_t mask = ::umask(0);
    ::umask(mask);
    mode = 0666 & ~mask;
  }
  if (::fchmod(fd.get(), mode) != 0) {
    return fail("Cannot set permissions on", path);
  }
  if (!write_all(fd.get(), bytes)) {
    return fail("Cannot write", path);
  }
  if (::fsync(fd.get()) != 0) {
    return fail("Cannot write", path);
  }
  if (fd.close() != 0) {
    return fail("Cannot write", path);
  }
  if (::rename(tmp.c_str(), path.c_str()) != 0) {
    return fail("Cannot replace", path);
  }

  // Persist the directory entry. Failure here does not undo the save, so it is not reported.
  Fd dir_fd(::open(dir.c_str(), O_RDONLY | O_DIRECTORY | O_CLOEXEC));
  if (dir_fd.get() >= 0) {
    ::fsync(dir_fd.get());
  }
  return {};
}

std::filesystem::path with_docx_extension(const std::filesystem::path &path) {
  if (path.has_extension()) {
    return path;
  }
  auto out = path;
  out += ".docx";
  return out;
}

} // namespace pagelite::file_io
