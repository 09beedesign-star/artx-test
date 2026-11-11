path = "client/src/components/workspace/RightPanel.tsx"
with open(path, "r") as f:
    content = f.read()

replacements = [
    # Remaining dark mode oklch values
    ('"oklch(0.59 0.010 270)"', '"#99999e"'),
    ('"oklch(0.69 0.010 270)"', '"#99999e"'),
    ('"oklch(0.65 0.010 270)"', '"#777472"'),
    ('"oklch(0.65 0.01 270)"', '"#99999e"'),
    ('"oklch(0.64 0.010 270)"', '"#777472"'),
    ('"oklch(0.57 0.010 270)"', '"#777472"'),
    ('"oklch(0.85 0.01 270)"', '"#f1f1f3"'),
    ('"oklch(0.22 0.01 270)"', '"#262627"'),
    ('"oklch(0.78 0.18 290)"', '"#161616"'),

    # Quality bar gradient (line 336)
    ('`linear-gradient(to right, oklch(0.58 0.22 290) ${quality}%, ${isDark ? "oklch(1 0 0 / 10%)" : "oklch(0 0 0 / 12%)"} ${quality}%)`',
     '`linear-gradient(to right, #161616 ${quality}%, ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)"} ${quality}%)`'),

    # Upload/export panel variables (lines 384-389)
    ('isDark ? "oklch(1 0 0 / 2%)"    : "oklch(0 0 0 / 2%)"', 'isDark ? "rgba(255,255,255,0.02)"  : "rgba(0,0,0,0.02)"'),
    ('isDark ? "oklch(1 0 0 / 12%)"   : "oklch(0 0 0 / 14%)"', 'isDark ? "rgba(255,255,255,0.12)"  : "rgba(0,0,0,0.14)"'),
    ('isDark ? "oklch(1 0 0 / 8%)"    : "oklch(0 0 0 / 8%)"', 'isDark ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.08)"'),
    ('isDark ? "oklch(1 0 0 / 15%)"   : "oklch(0 0 0 / 12%)"', 'isDark ? "rgba(255,255,255,0.15)"  : "rgba(0,0,0,0.12)"'),
    ('isDark ? "oklch(1 0 0 / 20%)"   : "oklch(0 0 0 / 18%)"', 'isDark ? "rgba(255,255,255,0.20)"  : "rgba(0,0,0,0.18)"'),

    # Hover border (line 426)
    ('"oklch(0.58 0.22 290 / 0.4)"', '"rgba(22,22,22,0.4)"'),

    # Palette colors (line 436)
    ('"oklch(0.15 0.02 270)"', '"#1a1a1a"'),
    ('"oklch(0.93 0.008 270)"', '"#f1f1f3"'),
]

for old, new in replacements:
    content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

remaining = content.count("oklch")
print(f"Done. Remaining oklch: {remaining}")
