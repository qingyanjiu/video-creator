import json, ssl, urllib.request, re
ctx = ssl.create_default_context()
req = urllib.request.Request("https://api.github.com/repos/mkhairi/undraw/git/trees/HEAD?recursive=1",
                             headers={"User-Agent":"Mozilla/5.0","Accept":"*/*"})
d = json.loads(urllib.request.urlopen(req, timeout=60, context=ctx).read())
paths = sorted(t["path"] for t in d.get("tree", []) if t["path"].lower().endswith(".svg"))
names = [p.rsplit("/",1)[-1][:-4] for p in paths]
json.dump(paths, open(r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\undraw_index.json","w"), indent=0)
print("total svg:", len(names))
groups = {
 "mother/baby": r"mother|baby|maternity|pregnan|nursing",
 "family/kids": r"family|kid|child|children|parent|play",
 "running/active": r"run|jog|active|sport|playing|skate|bike",
 "sick/doctor/hospital": r"sick|doctor|hospital|medical|nurse|patient|health|medicine|bed",
 "money/insurance": r"insurance|money|coins|piggy|savings|finance|wallet|budget|invest|grow|growth|tree|plant",
 "shield/safety": r"shield|safe|secure|protect|guard",
 "steps/goal": r"step|goal|target|progress|milestone|level|stairs|ascend|climb",
 "shop/ads": r"advert|market|shop|sale|promo|megaphone|announce",
}
for g, pat in groups.items():
    hits = [n for n in names if re.search(pat, n, re.I)]
    print("\n### %s (%d)" % (g, len(hits)))
    print("   " + ", ".join(hits[:40]))
