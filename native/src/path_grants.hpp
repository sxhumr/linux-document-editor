#pragma once

// The files the UI may touch. Every path enters this set only through a user action (a
// file dialog or a command-line argument), so a compromised page cannot read or overwrite
// arbitrary files by calling the native bindings with a path of its choosing.

#include <filesystem>
#include <set>

namespace pagelite {

class PathGrants {
public:
  /// Records `path` as user-chosen. Stored in absolute, lexically normal form.
  void grant(const std::filesystem::path &path);

  /// True only for a path previously granted (after the same normalisation).
  [[nodiscard]] bool is_granted(const std::filesystem::path &path) const;

private:
  static std::filesystem::path key(const std::filesystem::path &path);
  std::set<std::filesystem::path> granted_;
};

} // namespace pagelite
