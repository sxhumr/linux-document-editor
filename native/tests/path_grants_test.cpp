#include "path_grants.hpp"

#include <catch2/catch_test_macros.hpp>

using pagelite::PathGrants;

TEST_CASE("only granted paths are allowed") {
  PathGrants grants;
  CHECK_FALSE(grants.is_granted("/home/user/a.docx"));
  grants.grant("/home/user/a.docx");
  CHECK(grants.is_granted("/home/user/a.docx"));
  CHECK_FALSE(grants.is_granted("/home/user/b.docx"));
  CHECK_FALSE(grants.is_granted(""));
}

TEST_CASE("equivalent spellings match after normalisation") {
  PathGrants grants;
  grants.grant("/home/user/docs/a.docx");
  CHECK(grants.is_granted("/home/user/./docs/a.docx"));
  CHECK(grants.is_granted("/home/user/other/../docs/a.docx"));
}

TEST_CASE("a granted file does not grant its folder or siblings") {
  PathGrants grants;
  grants.grant("/home/user/docs/a.docx");
  CHECK_FALSE(grants.is_granted("/home/user/docs"));
  CHECK_FALSE(grants.is_granted("/home/user/docs/a.docx/../b.docx"));
  CHECK_FALSE(grants.is_granted("/home/user/docs/a.docx.bak"));
}
