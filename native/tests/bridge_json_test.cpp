#include "bridge_json.hpp"

#include <catch2/catch_test_macros.hpp>

using pagelite::bridge::document;
using pagelite::bridge::error;
using pagelite::bridge::file_ref;
using pagelite::bridge::quote;
using pagelite::bridge::startup_mark;

TEST_CASE("plain text is quoted unchanged") {
  CHECK(quote("report.docx") == R"("report.docx")");
  CHECK(quote("") == R"("")");
  CHECK(quote("café ✓") == "\"café ✓\"");
}

TEST_CASE("special characters are escaped") {
  CHECK(quote(R"(a"b)") == R"("a\"b")");
  CHECK(quote(R"(C:\x)") == R"("C:\\x")");
  CHECK(quote("a\nb\tc\rd") == R"("a\nb\tc\rd")");
  CHECK(quote(std::string_view("\x01\x1f", 2)) == R"("\u0001\u001f")");
}

TEST_CASE("line and paragraph separators are escaped for JavaScript") {
  CHECK(quote("a\u2028b\u2029c") == R"("a\u2028b\u2029c")");
}

TEST_CASE("a path cannot break out of its string") {
  CHECK(file_ref(R"(/tmp/x","evil":"1)", "x") == R"({"path":"/tmp/x\",\"evil\":\"1","name":"x"})");
}

TEST_CASE("reply shapes") {
  CHECK(file_ref("/a/b.docx", "b.docx") == R"({"path":"/a/b.docx","name":"b.docx"})");
  CHECK(document("/a/b.docx", "b.docx", "UEs=") ==
        R"({"path":"/a/b.docx","name":"b.docx","data":"UEs="})");
  CHECK(error("not-found", "gone") == R"({"code":"not-found","message":"gone"})");
}

TEST_CASE("startup timing lines") {
  CHECK(startup_mark("ui-ready", 812.345, 1760864400123) ==
        R"({"phase":"ui-ready","sinceMainMs":812.3,"unixMs":1760864400123})");
  CHECK(startup_mark(R"(x"y)", 0, 0) == R"({"phase":"x\"y","sinceMainMs":0.0,"unixMs":0})");
}
