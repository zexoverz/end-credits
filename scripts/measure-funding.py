"""Measure how many top npm packages declare a payable wallet address in their funding metadata.

For each package: npm registry `funding` field (latest version), then the GitHub repo root at HEAD:
FUNDING.json (Drips), funding.json (FLOSS/fund), tea.yaml (tea), .github/FUNDING.yml (GitHub).
Repos are deduplicated, since many packages share one monorepo.
"""
import json, re, sys, urllib.request, urllib.parse, concurrent.futures as cf

ADDR = re.compile(r"0x[a-fA-F0-9]{40}")
N = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
names = json.load(open("top1000.json"))[:N]

import time
def get(url, timeout=15):
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fundmeasure"}), timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 * (attempt + 1)); continue
            return e.code, ""
        except Exception:
            time.sleep(1 + attempt); continue
    return -1, ""

def gh_repo(repo):
    if not repo: return None
    url = repo.get("url") if isinstance(repo, dict) else repo
    if not url: return None
    m = re.search(r"github\.com[/:]([^/]+)/([^/#?]+?)(?:\.git)?(?:[/#?]|$)", url)
    if not m and re.fullmatch(r"[\w.-]+/[\w.-]+", url): m = re.match(r"([^/]+)/(.+)", url)
    return f"{m.group(1)}/{m.group(2)}".lower() if m else None

def npm(name):
    st, body = get(f"https://registry.npmjs.org/{urllib.parse.quote(name, safe='@')}/latest")
    if st != 200: return name, "ERR%d" % st, None
    d = json.loads(body)
    return name, d.get("funding"), gh_repo(d.get("repository"))

def repo_files(repo):
    out = {}
    for f in ["FUNDING.json", "funding.json", "tea.yaml", ".github/FUNDING.yml"]:
        st, body = get(f"https://raw.githubusercontent.com/{repo}/HEAD/{f}")
        if st == 200 and body.strip():
            out[f] = body
    return repo, out

with cf.ThreadPoolExecutor(6) as ex:
    pk = list(ex.map(npm, names))
repos = sorted({r for _, _, r in pk if r})
with cf.ThreadPoolExecutor(24) as ex:
    files = dict(ex.map(repo_files, repos))

rows = []
for name, funding, repo in pk:
    f = files.get(repo, {}) if repo else {}
    wallet_sources = [k for k, v in f.items() if ADDR.search(v)]
    npm_funding_addr = bool(funding and ADDR.search(json.dumps(funding)))
    if npm_funding_addr: wallet_sources.append("npm funding")
    rows.append({
        "name": name, "repo": repo,
        "npm_funding": bool(funding) and not (isinstance(funding, str) and funding.startswith("ERR")),
        "files": sorted(f.keys()),
        "wallet_sources": wallet_sources,
    })

json.dump(rows, open(f"result_{N}.json", "w"), indent=1)
def pct(x): return f"{x} ({100*x/len(rows):.1f}%)"
print("registry errors:", sum(1 for _, f, _ in pk if isinstance(f, str) and f.startswith("ERR")))
print("packages:", len(rows), "| with GitHub repo:", sum(1 for r in rows if r["repo"]), "| unique repos:", len(repos))
print("npm `funding` field (any form):", pct(sum(r["npm_funding"] for r in rows)))
print("any funding metadata (npm field or any file):", pct(sum(bool(r["npm_funding"] or r["files"]) for r in rows)))
for f in ["FUNDING.json", "funding.json", "tea.yaml", ".github/FUNDING.yml"]:
    print(f"  {f}:", pct(sum(f in r["files"] for r in rows)))
print("payable wallet address anywhere:", pct(sum(bool(r["wallet_sources"]) for r in rows)))
from collections import Counter
print("wallet sources:", Counter(s for r in rows for s in r["wallet_sources"]))
print("examples with wallet:", [r["name"] for r in rows if r["wallet_sources"]][:25])
