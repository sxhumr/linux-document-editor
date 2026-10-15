#include "path_grants.hpp"

namespace pagelite {

std::filesystem::path PathGrants::key(const std::filesystem::path &path) {
  std::error_code ec;
  auto absolute = std::filesystem::absolute(path, ec);
  return (ec ? path : absolute).lexically_normal();
}

void PathGrants::grant(const std::filesystem::path &path) {
  granted_.insert(key(path));
}

bool PathGrants::is_granted(const std::filesystem::path &path) const {
  return !path.empty() && granted_.contains(key(path));
}

} // namespace pagelite
