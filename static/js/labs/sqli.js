// SQL injection, on a real-looking web page: Wrenfield & Co's online shop (fictional) inside a browser window, with
// "Behind the scenes" showing the SQL the page builds from what you type, and the rows the database sends back.
// The shop's code pastes your input into its SQL (the bug). Turn on "parameterised queries" and the same input is
// only ever data. The database is a small MySQL 8.0 model (pure, tested in tests/sqli.test.mjs): SELECT with WHERE,
// AND/OR/NOT, =/!=/<>/LIKE, UNION [ALL], ORDER BY n, LIMIT, comments (-- , #, /* */), a few functions (SHA2,
// version(), database(), user(), CONCAT) and information_schema. Errors use MySQL's own codes and wording.
// Simplified, and said so in the lab's simplification: one connection, no types beyond numbers and strings.

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- SHA-256 (sync), for the shop's SHA2(password, 256): FIPS 180-4.
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
export function sha256(text) {
  const bytes = [...new TextEncoder().encode(String(text))], len = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(len / 2 ** (i * 8)) & 0xff);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.map(v => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

// ---------- the shop's database (fictional people, example.com addresses)
export function shopDb() {
  const users = [
    ["admin", "S3cure-Shop!2026", "admin", "it@wrenfield.example"],
    ["j.okafor", "Biscuit-Tin-42", "customer", "j.okafor@example.com"],
    ["m.reyes", "SummerTrip2025", "customer", "m.reyes@example.com"],
    ["p.lindqvist", "correct-horse-7", "customer", "p.lindqvist@example.com"],
  ].map(([username, pw, role, email], i) => ({ id: i + 1, username, password_hash: sha256(pw), role, email }));
  const products = [
    ["Oak chopping board", "24.00", "Hand-finished English oak, 40 cm."],
    ["Enamel mug", "9.50", "Cream enamel with a navy rim."],
    ["Linen apron", "32.00", "Washed linen, adjustable neck strap."],
    ["Copper whisk", "18.00", "Balloon whisk, copper-plated wires."],
    ["Stoneware bowl", "14.00", "Speckled glaze, 16 cm."],
    ["Beeswax wraps", "12.00", "Set of three, reusable."],
  ].map(([name, price, description], i) => ({ id: i + 1, name, price, description }));
  const cols = { users: ["id", "username", "password_hash", "role", "email"], products: ["id", "name", "price", "description"] };
  const tables = { users, products };
  tables["information_schema.tables"] = Object.keys(cols).map(t => ({ table_schema: "wrenfield_shop", table_name: t }));
  tables["information_schema.columns"] = Object.entries(cols).flatMap(([t, cs]) => cs.map(c => ({ table_schema: "wrenfield_shop", table_name: t, column_name: c })));
  cols["information_schema.tables"] = ["table_schema", "table_name"];
  cols["information_schema.columns"] = ["table_schema", "table_name", "column_name"];
  return { tables, cols, schema: "wrenfield_shop", version: "8.0.36", user: "shop_app@localhost" };
}

// ---------- tokens
class SqlError extends Error { constructor(code, state, msg) { super(msg); this.code = code; this.state = state; } }
const KW = new Set(["SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "UNION", "ALL", "ORDER", "BY", "LIMIT", "LIKE", "NULL", "AS", "ASC", "DESC", "IS"]);
export function tokenize(sql) {
  const out = []; let i = 0;
  const syntax = at => new SqlError(1064, "42000", `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${sql.slice(at, at + 80)}' at line 1`);
  while (i < sql.length) {
    const c = sql[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#" || (c === "-" && sql[i + 1] === "-" && (i + 2 >= sql.length || /\s/.test(sql[i + 2])))) { while (i < sql.length && sql[i] !== "\n") i++; continue; }
    if (c === "/" && sql[i + 1] === "*") { const e = sql.indexOf("*/", i + 2); if (e < 0) throw syntax(i); i = e + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, v = "";
      for (;;) {
        if (j >= sql.length) throw syntax(i);
        if (sql[j] === "\\" && j + 1 < sql.length) { v += sql[j + 1]; j += 2; continue; }
        if (sql[j] === c && sql[j + 1] === c) { v += c; j += 2; continue; }
        if (sql[j] === c) break;
        v += sql[j++];
      }
      out.push({ t: "str", v, at: i }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { const m = sql.slice(i).match(/^\d+(\.\d+)?/)[0]; out.push({ t: "num", v: Number(m), at: i }); i += m.length; continue; }
    if (c === "@" && sql[i + 1] === "@") { const m = sql.slice(i).match(/^@@[A-Za-z_]+/)[0]; out.push({ t: "sysvar", v: m.slice(2).toLowerCase(), at: i }); i += m.length; continue; }
    if (/[A-Za-z_]/.test(c)) {
      const m = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?/)[0], up = m.toUpperCase();
      out.push(KW.has(up) ? { t: "kw", v: up, at: i } : { t: "id", v: m, at: i }); i += m.length; continue;
    }
    const two = sql.slice(i, i + 2);
    if (["<>", "!=", "<=", ">="].includes(two)) { out.push({ t: "op", v: two, at: i }); i += 2; continue; }
    if ("=<>(),*;".includes(c)) { out.push({ t: c === "(" || c === ")" || c === "," || c === ";" || c === "*" ? c : "op", v: c, at: i }); i++; continue; }
    if (c === "|" && sql[i + 1] === "|") { out.push({ t: "kw", v: "OR", at: i }); i += 2; continue; }
    if (c === "&" && sql[i + 1] === "&") { out.push({ t: "kw", v: "AND", at: i }); i += 2; continue; }
    throw syntax(i);
  }
  return out;
}

// ---------- parse and run
const truthy = v => v != null && (typeof v === "number" ? v !== 0 : (parseFloat(v) || 0) !== 0);
function cmp(a, b) {
  if (a == null || b == null) return null;
  if (typeof a === "number" || typeof b === "number") { const x = typeof a === "number" ? a : parseFloat(a) || 0, y = typeof b === "number" ? b : parseFloat(b) || 0; return x === y ? 0 : x < y ? -1 : 1; }
  const x = String(a).toLowerCase(), y = String(b).toLowerCase(); return x === y ? 0 : x < y ? -1 : 1;  // the default collation ignores case
}
const like = (v, p) => v != null && p != null && new RegExp("^" + String(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", "is").test(String(v));

export function run(sql, db = shopDb()) {
  const toks = tokenize(sql); let p = 0;
  const peek = () => toks[p], at = () => (toks[p] ? toks[p].at : sql.length);
  const syntax = () => new SqlError(1064, "42000", `You have an error in your SQL syntax; check the manual that corresponds to your MySQL server version for the right syntax to use near '${sql.slice(at(), at() + 80)}' at line 1`);
  const isKw = v => peek()?.t === "kw" && peek().v === v;
  const eat = v => { if (isKw(v)) { p++; return true; } return false; };
  const need = v => { if (!eat(v)) throw syntax(); };

  function expr() { let l = andE(); while (isKw("OR")) { p++; const r = andE(), L = l, R = r; l = row => truthy(L(row)) || truthy(R(row)) ? 1 : 0; } return l; }
  function andE() { let l = notE(); while (isKw("AND")) { p++; const r = notE(), L = l, R = r; l = row => truthy(L(row)) && truthy(R(row)) ? 1 : 0; } return l; }
  function notE() { if (eat("NOT")) { const e = notE(); return row => truthy(e(row)) ? 0 : 1; } return comp(); }
  function comp() {
    const l = atom();
    if (peek()?.t === "op") { const op = toks[p++].v, r = atom(); return row => { const c = cmp(l(row), r(row)); if (c == null) return null; return { "=": c === 0, "!=": c !== 0, "<>": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op] ? 1 : 0; }; }
    if (isKw("NOT") && toks[p + 1]?.v === "LIKE") { p += 2; const r = atom(); return row => like(l(row), r(row)) ? 0 : 1; }
    if (eat("LIKE")) { const r = atom(); return row => like(l(row), r(row)) ? 1 : 0; }
    if (eat("IS")) { const neg = eat("NOT"); need("NULL"); return row => ((l(row) == null) !== neg ? 1 : 0); }
    return l;
  }
  function atom() {
    const t = peek(); if (!t) throw syntax();
    if (t.t === "str" || t.t === "num") { p++; return () => t.v; }
    if (t.t === "kw" && t.v === "NULL") { p++; return () => null; }
    if (t.t === "sysvar") { p++; const v = { version: db.version, hostname: "shop-db01", datadir: "/var/lib/mysql/" }[t.v]; if (v == null) throw new SqlError(1193, "HY000", `Unknown system variable '${t.v}'`); return () => v; }
    if (t.t === "(") { p++; const e = expr(); if (peek()?.t !== ")") throw syntax(); p++; return e; }
    if (t.t === "id") {
      p++;
      if (peek()?.t === "(") {  // a function call
        p++; const args = []; if (peek()?.t !== ")") { args.push(expr()); while (peek()?.t === ",") { p++; args.push(expr()); } } if (peek()?.t !== ")") throw syntax(); p++;
        const fn = t.v.toLowerCase();
        const F = { version: () => db.version, database: () => db.schema, schema: () => db.schema, user: () => db.user, current_user: () => db.user,
          sha2: row => { const v = args[0](row); return v == null ? null : sha256(String(v)); }, concat: row => { const vs = args.map(a => a(row)); return vs.some(v => v == null) ? null : vs.join(""); } };
        if (!F[fn]) throw new SqlError(1305, "42000", `FUNCTION ${db.schema}.${t.v} does not exist`);
        return F[fn];
      }
      const where = ctx;  // the clause this column is in, fixed when parsed (MySQL names it in the error)
      return row => { const k = t.v.toLowerCase(); if (!row || !Object.hasOwn(row, k)) throw new SqlError(1054, "42S22", `Unknown column '${t.v}' in '${where}'`); return row[k]; };
    }
    throw syntax();
  }
  let ctx = "field list";
  function select() {
    need("SELECT");
    const items = [];
    do {
      if (peek()?.t === "*") { p++; items.push({ star: true }); continue; }
      const start = p, e = (ctx = "field list", expr()); let name = sql.slice(toks[start].at, at()).trim();
      if (eat("AS") || peek()?.t === "id") { name = toks[p++].v; }
      items.push({ e, name });
    } while (peek()?.t === "," && ++p);
    let rows = [{}], table = null;
    if (eat("FROM")) {
      const t = peek(); if (!t || t.t !== "id") throw syntax(); p++;
      table = t.v.toLowerCase(); const key = table.startsWith(db.schema + ".") ? table.slice(db.schema.length + 1) : table;
      if (!Object.hasOwn(db.tables, key)) throw new SqlError(1146, "42S02", `Table '${table.includes(".") ? table : db.schema + "." + table}' doesn't exist`);
      table = key; rows = db.tables[key].map(r => ({ ...r }));
    }
    let where = null; if (eat("WHERE")) { ctx = "where clause"; where = expr(); }
    ctx = "field list";
    const out = rows.filter(r => !where || truthy(where(r)));
    const names = items.flatMap(it => it.star ? (table ? db.cols[table] : []) : [it.name]);
    if (items.some(it => it.star) && !table) throw new SqlError(1096, "HY000", "No tables used");
    const values = out.map(r => items.flatMap(it => it.star ? db.cols[table].map(c => r[c]) : [it.e(r)]));
    if (!out.length) items.forEach(it => { if (!it.star) try { it.e(rows[0] || {}); } catch (e) { if (e.code === 1054 && rows[0]) throw e; } });
    return { names, values };
  }
  let res = select();
  while (eat("UNION")) {
    eat("ALL"); const all = toks[p - 1].v === "ALL";
    const next = select();
    if (next.names.length !== res.names.length) throw new SqlError(1222, "21000", "The used SELECT statements have a different number of columns");
    const vals = res.values.concat(next.values);
    res = { names: res.names, values: all ? vals : vals.filter((v, i) => vals.findIndex(w => JSON.stringify(w) === JSON.stringify(v)) === i) };
  }
  if (eat("ORDER")) {
    need("BY"); const t = peek(); if (!t) throw syntax(); p++;
    if (t.t === "num") { if (t.v < 1 || t.v > res.names.length) throw new SqlError(1054, "42S22", `Unknown column '${t.v}' in 'order clause'`); const k = t.v - 1; res.values.sort((a, b) => cmp(a[k], b[k]) ?? 0); }
    else if (t.t === "id") { const k = res.names.findIndex(n => n.toLowerCase() === t.v.toLowerCase()); if (k < 0) throw new SqlError(1054, "42S22", `Unknown column '${t.v}' in 'order clause'`); res.values.sort((a, b) => cmp(a[k], b[k]) ?? 0); }
    else throw syntax();
    if (eat("DESC")) res.values.reverse(); else eat("ASC");
  }
  if (eat("LIMIT")) { const t = peek(); if (t?.t !== "num") throw syntax(); p++; res.values = res.values.slice(0, t.v); }
  if (peek()?.t === ";") p++;
  if (p < toks.length) throw syntax();
  return res;
}

// What the shop's code sends. Unsafe: input pasted into the string. Safe: placeholders, values bound separately.
export const LOGIN_SQL = (u, pw) => `SELECT id, username, role FROM users WHERE username = '${u}' AND password_hash = SHA2('${pw}', 256)`;
export const SEARCH_SQL = q => `SELECT name, price, description FROM products WHERE name LIKE '%${q}%'`;
const quoteLit = v => "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";

// One request to the shop, as its PHP code would make it. Returns { sql, shown, result | error }.
export function request(kind, input, { safe = false, db = shopDb() } = {}) {
  const u = input.username ?? "", pw = input.password ?? "", q = input.q ?? "";
  if (safe) {
    // Prepared statement: the SQL is fixed; the values are sent separately and are only ever data.
    const sql = kind === "login" ? "SELECT id, username, role FROM users WHERE username = ? AND password_hash = SHA2(?, 256)" : "SELECT name, price, description FROM products WHERE name LIKE CONCAT('%', ?, '%')";
    const bound = kind === "login" ? `SELECT id, username, role FROM users WHERE username = ${quoteLit(u)} AND password_hash = SHA2(${quoteLit(pw)}, 256)` : `SELECT name, price, description FROM products WHERE name LIKE CONCAT('%', ${quoteLit(q)}, '%')`;
    return { sql, params: kind === "login" ? [u, pw] : [q], result: run(bound, db) };
  }
  const sql = kind === "login" ? LOGIN_SQL(u, pw) : SEARCH_SQL(q);
  try { return { sql, result: run(sql, db) }; } catch (e) { if (!(e instanceof SqlError)) throw e; return { sql, error: { code: e.code, state: e.state, message: e.message } }; }
}

// ---------- objectives, checked against what has happened so far (pure; tested)
export function judge(history, db = shopDb()) {
  const admin = db.tables.users.find(u => u.role === "admin");
  const injected = h => /['"#\\]|--|\/\*/.test(Object.values(h.input).join(""));
  return {
    "sign-in": history.some(h => h.kind === "login" && !h.safe && h.result?.values?.[0]?.[1] === "j.okafor" && !injected(h)),
    "break": history.some(h => !h.safe && h.error?.code === 1064),
    "bypass": history.some(h => h.kind === "login" && !h.safe && injected(h) && h.result?.values?.[0]?.[2] === "admin"),
    "union": history.some(h => h.kind === "search" && !h.safe && /union/i.test(h.input.q || "") && h.result),
    "dump": history.some(h => h.kind === "search" && !h.safe && h.result?.values?.some(r => r.includes(admin.password_hash))),
    "fix": history.some(h => h.kind === "login" && h.safe && injected(h) && !h.result?.values?.length),
  };
}

// ---------- "What just happened" (20 Nov, the owner: the lab needed more explaining): one request's result in plain words,
// saying what the database did and what it tells you. Pure; tested in sqli.test.
export function explainResult(h, db = shopDb()) {
  if (!h) return "";
  const typed = Object.values(h.input).join(" "), injected = /['"#\\]|--|\/\*/.test(typed);
  if (h.safe) return h.result?.values?.length
    ? "Prepared statement: your input travelled as a value, separate from the SQL, and matched normally."
    : "Prepared statement: your input travelled as a value, never as SQL. The quote and the -- were simply searched for as text, so nothing matched and nothing broke. This is the fix.";
  if (h.error) {
    const m = h.error.message;
    if (h.error.code === 1054 && /order clause/.test(m)) return `ORDER BY ${m.match(/'(\d+)'/)?.[1] ?? "n"} sorts by that numbered column, and it doesn't exist. So the query has fewer columns than that: count down until the page loads again. That number is how many columns a UNION needs.`;
    if (h.error.code === 1054) return "MySQL doesn't know that column name. The rest of your SQL ran far enough to be checked, so the injection itself is working: fix the name.";
    if (h.error.code === 1222) return "Both halves of a UNION must return the same number of columns. Add or remove values in your SELECT until the counts match.";
    if (h.error.code === 1146) return "That table doesn't exist. Attackers look up real table names in information_schema.tables first.";
    return "Your quote ended the text early, so MySQL read the rest as SQL, couldn't make sense of it and stopped. A real site should log this, not show it: the error page tells an attacker the database is MySQL and that typing reaches the query.";
  }
  const rows = h.result?.values || [], admin = db.tables.users.find(u => u.role === "admin");
  if (h.kind === "login") {
    if (!rows.length) return injected ? "No row came back, so the shop said no. Look at The SQL: what would make the WHERE true, or stop the password check being read at all?" : "No user matched that username and password together, so the shop said no.";
    if (injected && rows[0][2] === "admin") return "The -- (or #) turned everything after it into a comment, so the password check never ran. MySQL only saw WHERE username = 'admin' and handed back the admin's row.";
    if (injected) return `Signed in as ${rows[0][1]} without that account's password: your input changed what the WHERE asked for.`;
    return "A normal sign-in: your username and password went inside quote marks in the SQL, and one user matched both.";
  }
  if (/union/i.test(h.input.q || "")) {
    if (rows.some(r => r.includes(admin.password_hash))) return "Those are rows from the users table, printed where products should be: usernames and password hashes. The shop only ever meant to show products. This is a data breach.";
    return "MySQL accepted your UNION and glued its rows onto the product list. Each column you SELECT appears where the shop prints a product's name, price and description, so you now choose what this page displays.";
  }
  if (injected) return `Your characters changed the SQL but it still ran: ${rows.length} row${rows.length === 1 ? "" : "s"} came back. Compare The SQL with what a normal search sends.`;
  return `A normal search: ${rows.length} product${rows.length === 1 ? "" : "s"} matched. Everything you typed sat inside quote marks in the SQL.`;
}

// ---------- the page
export function mount(root, lab, { solved = [], onPart = () => {}, onComplete = () => {}, onReset = () => {} } = {}) {
  const db = shopDb(), done = new Set(solved), history = [];
  let page = "login", safe = false, last = null, who = null, view = "query", searched = "", hinted = null;
  root.innerHTML = `<div class="sq-lab">
    <div class="view-head"><a class="link-btn" href="#missions">← Missions</a>
      <div class="eyebrow">Lab · ${esc(lab.track)} · ${lab.minutes} min</div><h1>${esc(lab.title)}</h1><p>${esc(lab.intro)}</p></div>
    <div class="sq-grid">
      <div class="sq-left">
      <section class="bw" aria-label="A web browser showing Wrenfield and Co's shop (simulated)">
        <div class="bw-top"><span class="bw-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="bw-tab"><span class="bw-fav" aria-hidden="true">W</span>Wrenfield &amp; Co</span></div>
        <div class="bw-bar"><span class="bw-nav" aria-hidden="true">‹ › ↻</span><div class="bw-url"><span class="bw-lock" aria-hidden="true">🔒</span><span id="sq-url"></span></div></div>
        <div class="bw-page" id="sq-page"></div>
      </section>
      <div class="sq-explain" id="sq-explain" aria-live="polite"></div>
      </div>
      <aside class="sq-side">
        <section class="sq-panel"><div class="sq-ptitle"><h2>Behind the scenes</h2>
          <div class="row" role="group" aria-label="What to show"><button type="button" class="chip" data-sqv="query" aria-pressed="true">The SQL</button><button type="button" class="chip" data-sqv="rows" aria-pressed="false">What came back</button><button type="button" class="chip" data-sqv="code" aria-pressed="false">The code</button></div></div>
          <div id="sq-behind" aria-live="polite"></div></section>
        <section class="sq-panel"><div class="sq-ptitle"><h2>Objectives</h2><span class="mono" id="sq-count"></span></div><ol class="sq-tasks" id="sq-tasks"></ol>
          <div class="row"><button type="button" class="link-btn" id="sq-hint">Show a hint</button></div><div id="sq-hinttext"></div>
          <label class="sq-fix"><input type="checkbox" id="sq-safe"> <span><b>Fix the code:</b> use parameterised queries</span></label>
          <div class="row"><button class="btn ghost" id="sq-reset" type="button">↺ Reset lab</button></div></section>
      </aside>
    </div>
    <details class="tbl simplification"><summary>How this simulation differs from a real site</summary><p>${esc(lab.simplification)}</p></details>
  </div>`;
  const $ = id => root.querySelector("#" + id);

  const hl = (sql, inputs) => {  // colour the SQL; what the visitor typed is marked, so you can see it become code
    let h = esc(sql);
    for (const v of inputs.filter(Boolean).sort((a, b) => b.length - a.length)) h = h.split(esc(v)).join(`<mark class="sq-in">${esc(v)}</mark>`);
    return h.replace(/\b(SELECT|FROM|WHERE|AND|OR|UNION|ALL|ORDER BY|LIMIT|LIKE|NOT|NULL)\b/g, '<b class="sq-kw">$1</b>');
  };
  function drawBehind() {
    root.querySelectorAll("[data-sqv]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sqv === view)));
    const box = $("sq-behind");
    if (view === "code") {
      box.innerHTML = `<p class="muted sq-note">The shop is written in PHP 8.2 with mysqli. ${safe ? "Fixed version:" : "As it ships:"}</p>
        <pre class="sq-code">${safe ? esc(`$stmt = $db->prepare(
  "SELECT id, username, role FROM users
   WHERE username = ? AND password_hash = SHA2(?, 256)");
$stmt->execute([$_POST['username'], $_POST['password']]);
$user = $stmt->get_result()->fetch_assoc();`) : esc(`$sql = "SELECT id, username, role FROM users
        WHERE username = '" . $_POST['username'] . "'
        AND password_hash = SHA2('" . $_POST['password'] . "', 256)";
$user = $db->query($sql)->fetch_assoc();   // your input is now part of the SQL`)}</pre>`;
      return;
    }
    if (!last) { box.innerHTML = `<p class="muted sq-note">Use the shop on the left. Every time it talks to its database, the SQL it sends appears here.</p>`; return; }
    const inputs = Object.values(last.input);
    if (view === "query") {
      box.innerHTML = `<p class="eyebrow">${last.safe ? "Sent as a prepared statement" : "Sent to MySQL 8.0"}</p>
        <pre class="sq-sql">${last.safe ? esc(last.sql) : hl(last.sql, inputs)}</pre>
        ${last.safe ? `<p class="eyebrow">Values, sent separately (only ever data)</p><ul class="sq-params">${last.params.map(v => `<li><mark class="sq-in">${esc(v)}</mark></li>`).join("")}</ul>` : `<p class="muted sq-note"><mark class="sq-in">Highlighted</mark> is what you typed.</p>`}
        ${last.error ? `<p class="sq-err">ERROR ${last.error.code} (${esc(last.error.state)}): ${esc(last.error.message)}</p>` : ""}`;
      return;
    }
    const r = last.result;
    box.innerHTML = last.error ? `<p class="sq-err">No rows: the database stopped with error ${last.error.code}.</p>`
      : `<p class="eyebrow">${r.values.length} row${r.values.length === 1 ? "" : "s"}</p><div class="sq-grid-wrap" tabindex="0" role="region" aria-label="Rows returned"><table class="sq-rows"><thead><tr>${r.names.map(n => `<th scope="col">${esc(n)}</th>`).join("")}</tr></thead>
        <tbody>${r.values.map(v => `<tr>${v.map(c => `<td>${c == null ? '<i class="muted">NULL</i>' : esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${r.names.length}" class="muted">(empty set)</td></tr>`}</tbody></table></div>`;
  }

  const shopHead = () => `<header class="ws-head"><span class="ws-logo">Wrenfield <i>&amp;</i> Co</span><nav class="ws-nav"><button type="button" data-ws="search">Shop</button><button type="button" data-ws="login">${who ? esc(who.username) : "Sign in"}</button></nav></header>`;
  function drawPage() {
    const url = { login: "/login", search: `/search?q=${encodeURIComponent(searched)}`, account: "/account", error: last?.kind === "search" ? `/search?q=${encodeURIComponent(searched)}` : "/login" }[page];
    $("sq-url").innerHTML = `<span class="muted">https://</span>shop.wrenfield.example${esc(url)}`;
    const P = $("sq-page");
    if (page === "error") {
      P.innerHTML = `<div class="ws-raw"><b>Fatal error</b>: Uncaught mysqli_sql_exception: ${esc(last.error.message)} in /var/www/html/${last.kind === "login" ? "login" : "search"}.php:31
Stack trace:
#0 /var/www/html/${last.kind === "login" ? "login" : "search"}.php(31): mysqli->query()
#1 {main}
  thrown in <b>/var/www/html/${last.kind === "login" ? "login" : "search"}.php</b> on line <b>31</b></div>
        <p class="ws-back"><button type="button" class="ws-link" data-ws="${last.kind === "login" ? "login" : "search"}">← Back</button></p>`;
      return;
    }
    if (page === "login") {
      P.innerHTML = `${shopHead()}<div class="ws-main"><form class="ws-card" id="ws-login" autocomplete="off"><h2>Sign in</h2>
        <label>Username<input name="username" id="ws-u" spellcheck="false" autocapitalize="off"></label>
        <label>Password<input name="password" id="ws-p" type="text" spellcheck="false" autocapitalize="off" class="ws-pw"></label>
        <button class="ws-btn" type="submit">Sign in</button><p class="ws-small">Test account: <b>j.okafor</b> / <b>Biscuit-Tin-42</b></p>
        ${last && last.kind === "login" && !last.error && !last.result.values.length ? `<p class="ws-bad" role="alert">Wrong username or password.</p>` : ""}</form></div>`;
      return;
    }
    if (page === "account") {
      const admin = who.role === "admin";
      P.innerHTML = `${shopHead()}<div class="ws-main"><div class="ws-hello"><h2>Welcome back, ${esc(who.username)}</h2>${admin
        ? `<p class="ws-admin">Admin dashboard</p><div class="ws-stats"><span><b>37</b> orders today</span><span><b>1,284</b> customers</span><span><b>£2,906</b> takings</span></div><p class="ws-small">Signed in as <b>${esc(who.username)}</b> (role <b>${esc(who.role)}</b>) without ever typing the admin password.</p>`
        : `<p>Your orders: 1 parcel on its way.</p>`}<button type="button" class="ws-link" data-signout>Sign out</button></div></div>`;
      return;
    }
    const r = last && last.kind === "search" && !last.error ? last.result : null, rows = r ? r.values : db.tables.products.map(x => [x.name, x.price, x.description]);
    P.innerHTML = `${shopHead()}<div class="ws-main"><form class="ws-search" id="ws-search" autocomplete="off"><label class="sr-only" for="ws-q">Search the shop</label><input id="ws-q" placeholder="Search the shop" value="${esc(searched)}" spellcheck="false" autocapitalize="off"><button class="ws-btn" type="submit">Search</button></form>
      <div class="ws-grid">${rows.map(v => `<article class="ws-prod"><div class="ws-ph" aria-hidden="true"></div><b>${esc(v[0])}</b><span class="ws-price">£${esc(v[1])}</span><p>${esc(v[2] ?? "")}</p></article>`).join("") || `<p class="muted">No products match.</p>`}</div></div>`;
  }
  function drawTasks() {
    const got = judge(history, db);
    lab.tasks.forEach(t => { if (got[t.id] && !done.has(t.id)) { done.add(t.id); onPart(t.id); } });
    const next = lab.tasks.find(t => !done.has(t.id));
    $("sq-tasks").innerHTML = lab.tasks.map(t => `<li class="${done.has(t.id) ? "got" : t === next ? "now" : ""}">${done.has(t.id) ? "✓ " : ""}${esc(t.text)}${done.has(t.id) && t.why ? `<span class="vl-why">${esc(t.why)}</span>` : ""}</li>`).join("");
    $("sq-count").textContent = `${done.size}/${lab.tasks.length}`;
    $("sq-hint").hidden = !next;
    if (!next || next.id !== hinted) { $("sq-hinttext").innerHTML = ""; hinted = null; }  // a hint stays open until its objective is done
    if (!next && done.size === lab.tasks.length) { onComplete(); globalThis.PN_patch?.("Broken in, then fixed it. That's the whole job.", 6000); }
  }
  function send(kind, input) {
    const r = request(kind, input, { safe, db });
    last = { kind, input, safe, ...r }; history.push(last);
    if (r.error) page = "error";
    else if (kind === "login") { const row = r.result.values[0]; if (row) { who = { id: row[0], username: row[1], role: row[2] }; page = "account"; } else page = "login"; }
    else page = "search";
    drawPage(); drawBehind(); drawTasks(); drawExplain();
  }
  function drawExplain() {
    const t = explainResult(last, db);
    $("sq-explain").innerHTML = t ? `<h2>What just happened</h2><p>${esc(t)}</p>` : `<h2>What just happened</h2><p class="muted">Use the shop: sign in or search. After each request, this says what the database did.</p>`;
  }
  root.addEventListener("submit", e => {
    e.preventDefault();
    if (e.target.id === "ws-login") send("login", { username: $("ws-u").value, password: $("ws-p").value });
    if (e.target.id === "ws-search") { searched = $("ws-q").value; send("search", { q: searched }); }
  });
  root.addEventListener("click", e => {
    const g = e.target.closest("[data-ws]"); if (g) { page = g.dataset.ws === "login" && who ? "account" : g.dataset.ws; if (page === "search") { last = last?.kind === "search" ? last : null; } drawPage(); return; }
    if (e.target.closest("[data-signout]")) { who = null; page = "login"; drawPage(); return; }
    const v = e.target.closest("[data-sqv]"); if (v) { view = v.dataset.sqv; drawBehind(); return; }
  });
  $("sq-safe").addEventListener("change", e => { safe = e.target.checked; drawBehind(); });
  $("sq-hint").addEventListener("click", () => { const t = lab.tasks.find(x => !done.has(x.id)); if (t) { hinted = t.id; $("sq-hinttext").innerHTML = `<div class="feedback">${esc(t.hint)}</div>`; } });
  $("sq-reset").addEventListener("click", onReset);
  drawPage(); drawBehind(); drawTasks(); drawExplain();
}
