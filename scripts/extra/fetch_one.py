import os, ssl, time, urllib.request
WORK = r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work"
OUT = os.path.join(WORK, "src", "assets")
ctx = ssl.create_default_context()
urls = [
 "https://raw.githubusercontent.com/mkhairi/undraw/master/vendor/assets/images/undraw/motherhood.svg",
 "https://raw.githubusercontent.com/maartenpaauw/undraw/master/docs/illustrations/motherhood.svg",
 "https://cdn.jsdelivr.net/gh/mkhairi/undraw@master/vendor/assets/images/undraw/motherhood.svg",
]
for attempt in range(4):
    for u in urls:
        try:
            req = urllib.request.Request(u, headers={"User-Agent":"Mozilla/5.0"})
            b = urllib.request.urlopen(req, timeout=40, context=ctx).read().decode("utf-8","replace")
            open(os.path.join(OUT,"motherhood.svg"),"w",encoding="utf-8").write(b)
            print("OK", u.split('/')[2], len(b)//1024, "KB"); raise SystemExit
        except SystemExit: raise
        except Exception as e:
            print("try%d ERR %s %s" % (attempt, u.split('/')[2], str(e)[:70]))
            time.sleep(2)
print("FAILED")
