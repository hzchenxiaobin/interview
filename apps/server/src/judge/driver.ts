import type { MethodSpec } from "./parse.js";

// ---------------------------------------------------------------------------
// 判题驱动生成：C++（编译运行）与 Python（解释运行）。
// 程序输入：stdin 一个 JSON 对象 {"参数名": 值}；输出：JSON 序列化的返回值。
// ---------------------------------------------------------------------------

/** 生成完整 C++ 源码：标准库前导 + 用户代码 + 判题 main */
export function buildCppSource(userCode: string, spec: MethodSpec): string {
  const argDecls = spec.params
    .map((p, i) => `  auto a${i} = jAs<${p.type}>(arg(obj, "${p.name}", ${i}));`)
    .join("\n");
  const callArgs = spec.params.map((_, i) => `a${i}`).join(", ");
  return `#include <bits/stdc++.h>
using namespace std;

${userCode}

// ---------------- 判题驱动（自动生成，请勿修改） ----------------

struct JVal {
  int tag = 0; // 0 null, 1 bool, 2 number, 3 string, 4 array, 5 object
  bool b = false;
  double n = 0;
  string s;
  vector<JVal> a;
  vector<pair<string, JVal>> o;
};

struct JParser {
  const string& t;
  size_t i = 0;
  explicit JParser(const string& t) : t(t) {}
  void ws() { while (i < t.size() && isspace((unsigned char)t[i])) i++; }
  JVal parse() { ws(); return value(); }
  JVal value() {
    ws();
    char c = t[i];
    if (c == '{') return object();
    if (c == '[') return array();
    if (c == '"') { JVal v; v.tag = 3; v.s = str(); return v; }
    if (c == 't') { i += 4; JVal v; v.tag = 1; v.b = true; return v; }
    if (c == 'f') { i += 5; JVal v; v.tag = 1; return v; }
    if (c == 'n') { i += 4; return JVal{}; }
    return num();
  }
  JVal num() {
    size_t start = i;
    if (t[i] == '-') i++;
    while (i < t.size() && (isdigit((unsigned char)t[i]) || t[i] == '.' || t[i] == 'e' || t[i] == 'E' || t[i] == '+' || t[i] == '-')) i++;
    JVal v; v.tag = 2; v.n = stod(t.substr(start, i - start)); return v;
  }
  string str() {
    string r;
    i++; // 开引号
    while (i < t.size() && t[i] != '"') {
      if (t[i] == '\\\\' && i + 1 < t.size()) {
        i++;
        switch (t[i]) {
          case 'n': r += '\\n'; break;
          case 't': r += '\\t'; break;
          case 'r': r += '\\r'; break;
          default: r += t[i];
        }
        i++;
      } else {
        r += t[i++];
      }
    }
    i++; // 闭引号
    return r;
  }
  JVal array() {
    JVal v; v.tag = 4;
    i++; ws();
    if (t[i] == ']') { i++; return v; }
    while (true) {
      v.a.push_back(value()); ws();
      if (t[i] == ',') { i++; continue; }
      i++; break; // ']'
    }
    return v;
  }
  JVal object() {
    JVal v; v.tag = 5;
    i++; ws();
    if (t[i] == '}') { i++; return v; }
    while (true) {
      ws();
      string key = str(); ws();
      i++; // ':'
      v.o.emplace_back(key, value()); ws();
      if (t[i] == ',') { i++; continue; }
      i++; break; // '}'
    }
    return v;
  }
};

const JVal& arg(const JVal& obj, const string& name, size_t idx) {
  for (const auto& [k, v] : obj.o) if (k == name) return v;
  return obj.o.at(idx).second;
}

template <typename T>
T jAs(const JVal& v) {
  if constexpr (is_same_v<T, int>) return (int)v.n;
  else if constexpr (is_same_v<T, long long>) return (long long)v.n;
  else if constexpr (is_same_v<T, double>) return v.n;
  else if constexpr (is_same_v<T, float>) return (float)v.n;
  else if constexpr (is_same_v<T, bool>) return v.b;
  else if constexpr (is_same_v<T, char>) return v.s.empty() ? '\\0' : v.s[0];
  else if constexpr (is_same_v<T, string>) return v.s;
  else {
    T r;
    for (const auto& e : v.a) r.push_back(jAs<typename T::value_type>(e));
    return r;
  }
}

void printJ(int v) { cout << v; }
void printJ(long long v) { cout << v; }
void printJ(double v) { cout << setprecision(12) << v; }
void printJ(float v) { cout << setprecision(7) << v; }
void printJ(bool v) { cout << (v ? "true" : "false"); }
void printJ(char c) { cout << '"' << c << '"'; }
void printJ(const string& s) {
  cout << '"';
  for (char c : s) {
    if (c == '"' || c == '\\\\') cout << '\\\\' << c;
    else if (c == '\\n') cout << "\\\\n";
    else cout << c;
  }
  cout << '"';
}
template <typename T>
void printJ(const vector<T>& v) {
  cout << '[';
  for (size_t i = 0; i < v.size(); i++) {
    if (i) cout << ',';
    printJ(v[i]);
  }
  cout << ']';
}

int main() {
  ios::sync_with_stdio(false);
  string input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
  JVal obj = JParser(input).parse();
${argDecls}
  Solution sol;
  auto ret = sol.${spec.name}(${callArgs});
  printJ(ret);
  cout << '\\n';
  return 0;
}
`;
}

/** 生成完整 Python 源码：typing 前导 + 用户代码 + 判题驱动 */
export function buildPythonSource(userCode: string, methodName: string): string {
  return `from typing import *
import json, sys

${userCode}

# ---------------- 判题驱动（自动生成，请勿修改） ----------------

def __judge_main():
    data = json.load(sys.stdin)
    ret = getattr(Solution(), ${JSON.stringify(methodName)})(*data.values())
    print(json.dumps(ret, ensure_ascii=False))

__judge_main()
`;
}
