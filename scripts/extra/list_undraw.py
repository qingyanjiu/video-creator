import json, os
paths = json.load(open(r"C:\Users\qingy\Documents\Codex\2026-10-12\new-chat\work\undraw_index.json"))
names = [os.path.basename(p)[:-4] for p in paths]
names.sort()
for i in range(0, len(names), 6):
    print("  ".join(n.ljust(26) for n in names[i:i+6]))
