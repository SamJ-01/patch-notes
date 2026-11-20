// "Read a line" for evidence labs (20 Nov, the owner: a newcomer should get the idea at a glance, as the permissions lab's
// "- rwx r-x r--" now does). Pure: finds a line in a lab's own log that matches a known format and splits it into labelled
// parts. The parts join back to exactly the original line (tested), so the picture can never drift from the evidence.
// Each format: a test, and split(line) -> [[text, label | null]] (null = spacing between parts).

const sp = s => [s, null];
// Split "a  b  c" on runs of two or more spaces, keeping the spacing as unlabelled parts.
const cells = s => s.split(/(\s{2,})/).filter(Boolean).map(t => (/^\s+$/.test(t) ? sp(t) : [t, ""]));

// The tail of an sshd message: "Failed password" "for admin" "from 203.0.113.7" "port 52144 ssh2".
function sshdMessage(msg) {
  const m = msg.match(/^(.*?)( for (?:invalid user )?\S+)( from \S+)( port \d+.*)$/);
  if (!m) return [[msg, "what happened"]];
  return [[m[1], "what happened"], [m[2].slice(1), "which account"], [m[3].slice(1), "from where (IP)"], [m[4].slice(1), "port and protocol"]].flatMap((x, i) => (i ? [sp(" "), x] : [x]));
}

const KEY = { user: "who (account)", ip: "from where (IP)", status: "result (HTTP status)", owner: "whose record", logon_type: "how they logged on",
  source: "from where", parent: "started by", target: "what it touched", order: "which record" };

export const FORMATS = [
  { id: "sshd", name: "Linux auth.log (sshd)",
    re: /^([A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d) (\S+) ([\w.-]+\[\d+\]): (.*)$/,
    split: m => [[m[1], "when"], sp(" "), [m[2], "which machine"], sp(" "), [m[3], "which program [process ID]"], sp(": "), ...sshdMessage(m[4])] },
  { id: "nginx", name: "Web server access log (nginx/Apache combined)",
    re: /^(\S+)( )(\S+ \S+)( )(\[[^\]]+\])( )("[^"]*")( )(\d{3})( )(\d+|-)( )("[^"]*")( )("[^"]*")$/,
    split: m => [[m[1], "who (client IP)"], sp(m[2]), [m[3], "login names (usually - -)"], sp(m[4]), [m[5], "when"], sp(m[6]), [m[7], "what they asked for"], sp(m[8]),
      [m[9], "result (HTTP status)"], sp(m[10]), [m[11], "size sent (bytes)"], sp(m[12]), [m[13], "page they came from"], sp(m[14]), [m[15], "browser or tool"]] },
  { id: "audit", name: "Web app audit log",
    re: /^(\d{4}-\d\d-\d\dT[\d:]+Z)(\s+)(.*\buser=.*)$/,
    split: m => [[m[1], "when (UTC)"], sp(m[2]), ...cells(m[3]).map(([t, l]) => (l === null ? [t, l] : [t, KEY[t.split("=")[0]] || (/^(GET|POST|PUT|DELETE) /.test(t) ? "what they asked for" : "detail")]))] },
  { id: "edr", name: "EDR timeline",
    re: /^(\d\d:\d\d:\d\d)(\s+)(LOGON|PROCESS|FILE|NETWORK|REGISTRY|SERVICE|TASK)(\s+)(.*)$/,
    split: m => [[m[1], "when"], sp(m[2]), [m[3], "kind of event"], sp(m[4]), ...cells(m[5]).map(([t, l]) => (l === null ? [t, l] : [t, KEY[t.split("=")[0]] || "what happened"]))] },
  { id: "entra", name: "Microsoft Entra ID sign-ins",
    re: /^(\d\d:\d\d:\d\d)(\s+)(\S+@\S+)(\s+)(.+?)(\s{2,})(\d+\.\d+\.\d+\.\d+)(\s+)([A-Z]{2})(\s+)(Success|Failure|Interrupted)(\s+)(.*)$/,
    split: m => [[m[1], "when"], sp(m[2]), [m[3], "which account"], sp(m[4]), [m[5], "which app"], sp(m[6]), [m[7], "from where (IP)"], sp(m[8]), [m[9], "country"], sp(m[10]),
      [m[11], "result"], sp(m[12]), [m[13], "error code and reason"]] },
  { id: "nmap", name: "Nmap port line", prefer: /\sopen\s/,
    re: /^(\d+\/(?:tcp|udp))(\s+)(open|closed|filtered|open\|filtered)(\s+)(\S+)(?:(\s+)(.+))?$/,
    split: m => [[m[1], "port / protocol"], sp(m[2]), [m[3], "state"], sp(m[4]), [m[5], "service (Nmap's guess)"], ...(m[7] ? [sp(m[6]), [m[7], "version it reported"]] : [])] },
  { id: "ls", name: "ls -l (Linux)",
    re: /^([-dlcbps][rwxsStT-]{9})(\s+)(\d+)(\s+)(\S+)(\s+)(\S+)(\s+)(\d+)(\s+)([A-Z][a-z]{2}\s+\d+\s+[\d:]+)(\s+)(.+)$/,
    split: m => [[m[1], "type and permissions"], sp(m[2]), [m[3], "links"], sp(m[4]), [m[5], "owner"], sp(m[6]), [m[7], "group"], sp(m[8]), [m[9], "size (bytes)"], sp(m[10]),
      [m[11], "last changed"], sp(m[12]), [m[13], "name"]] },
  { id: "ping", name: "Windows ping reply",
    re: /^(Reply from \S+?:)( )(bytes=\d+)( )(time[=<]\d+ms)( )(TTL=\d+)$/,
    split: m => [[m[1], "who answered"], sp(m[2]), [m[3], "packet size"], sp(m[4]), [m[5], "round trip"], sp(m[6]), [m[7], "hops left (TTL)"]] },
];

// A line of `text` in the first known format it contains, choosing the line that splits into the most labelled parts.
export function readLine(text) {
  const lines = String(text || "").split("\n");
  for (const f of FORMATS) {
    let best = null;
    for (const line of lines) {
      const m = line.match(f.re); if (!m) continue;
      // More labelled parts wins; a format can also prefer some lines (Nmap: an open port says more than a closed one).
      const parts = f.split(m), n = parts.filter(p => p[1]).length + (f.prefer?.test(line) ? 0.5 : 0);
      if (!best || n > best.n) best = { format: f.id, name: f.name, line, parts, n };
    }
    if (best) return best;
  }
  return null;
}
