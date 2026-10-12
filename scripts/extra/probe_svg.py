import json, ssl, urllib.request, urllib.parse, re
ctx = ssl.create_default_context()
def raw(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=40, context=ctx).read()
d = json.loads(raw("https://api.github.com/repos/mkhairi/undraw"))
print("default_branch:", d["default_branch"], "| license:", (d.get("license") or {}).get("spdx_id"))
b = raw("https://cdn.jsdelivr.net/gh/mkhairi/undraw@%s/vendor/assets/images/undraw/motherhood.svg" % d["default_branch"])
print("bytes:", len(b))
s = b.decode("utf-8", "replace")
print("head:", s[:300].replace("\n"," "))
cols = {}
for m in re.finditer(r'#[0-9a-fA-F]{6}', s):
    cols[m.group(0)] = cols.get(m.group(0), 0) + 1
print("colors:", sorted(cols.items(), key=lambda kv:-kv[1]))
print("viewBox:", re.findall(r'viewBox="[^"]+"', s))
print("has fill=#6c63ff:", "#6c63ff" in s.lower())
paths = re.findall(r'<path[^>]*>', s)
print("paths:", len(paths))
print("sample path:", paths[0][:220] if paths else None)
open(r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\sample_motherhood.svg","w",encoding="utf-8").write(s)
