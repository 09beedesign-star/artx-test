import re

path = "client/src/components/workspace/RightPanel.tsx"
with open(path, "r") as f:
    content = f.read()

# Style color replacements - dark mode neutral oklch to hex
replacements = [
    # Style preset colors (lines 20-25)
    ('"oklch(0.58 0.22 290)"', '"#161616"'),      # cinematic purple -> black
    ('"oklch(0.72 0.18 200)"', '"#333333"'),      # editorial cyan -> gray
    ('"oklch(0.70 0.01 270)"', '"#99999e"'),      # minimal -> gray
    ('"oklch(0.75 0.18 60)"', '"#fbbf24"'),       # bold -> amber (keep warm)
    ('"oklch(0.62 0.010 270)"', '"#777472"'),     # dark -> gray
    ('"oklch(0.80 0.12 330)"', '"#d4a3d4"'),      # pastel -> soft lavender

    # Panel variables (lines 45-49)
    ('isDark ? "oklch(0.12 0.016 270)"      : "#F5F5F5"', 'isDark ? "#0d0d0d"      : "#f5f5f5"'),
    ('isDark ? "oklch(1 0 0 / 6%)"          : "oklch(0 0 0 / 8%)"', 'isDark ? "rgba(255,255,255,0.06)"     : "rgba(0,0,0,0.08)"'),
    ('isDark ? "oklch(1 0 0 / 8%)"          : "oklch(0 0 0 / 7%)"', 'isDark ? "rgba(255,255,255,0.08)"     : "rgba(0,0,0,0.07)"'),
    ('isDark ? "oklch(0.92 0.008 270)"   : "oklch(0.18 0.01 270)"', 'isDark ? "#f1f1f3"     : "#161616"'),
    ('isDark ? "oklch(0.64 0.010 270)"  : "oklch(0.66 0.010 270)"', 'isDark ? "#99999e"     : "#777472"'),

    # Gradient brand (line 113)
    ('"linear-gradient(135deg, oklch(0.58 0.22 290), oklch(0.72 0.18 200))"', '"#161616"'),

    # Layer panel colors (lines 133-140)
    ('isDark ? "oklch(0.59 0.010 270)" : "oklch(0.62 0.010 270)"', 'isDark ? "#99999e" : "#777472"'),
    ('isDark ? "oklch(0.78 0.008 270)" : "oklch(0.22 0.008 270)"', 'isDark ? "#cccccc" : "#262627"'),
    ('isDark ? "oklch(0.69 0.010 270)"  : "oklch(0.62 0.010 270)"', 'isDark ? "#99999e"  : "#777472"'),
    ('isDark ? "oklch(0.62 0.010 270)"  : "oklch(0.65 0.010 270)"', 'isDark ? "#777472"  : "#99999e"'),
    ('isDark ? "oklch(0.65 0.008 270)" : "oklch(0.38 0.008 270)"', 'isDark ? "#99999e" : "#555555"'),
    ('isDark ? "oklch(0.64 0.010 270)"  : "oklch(0.65 0.010 270)"', 'isDark ? "#777472"  : "#99999e"'),

    # Eye/Lock icons (lines 198, 206, 234, 241)
    ('isDark ? "oklch(0.57 0.010 270)" : "oklch(0.65 0.01 270)"', 'isDark ? "#777472" : "#99999e"'),
    ('isDark ? "oklch(0.35 0.01 270)" : "oklch(0.65 0.01 270)"', 'isDark ? "#555555" : "#99999e"'),
    ('"oklch(0.72 0.18 60)"', '"#fbbf24"'),

    # Export panel variables (lines 272-279)
    ('isDark ? "oklch(1 0 0 / 4%)"  : "oklch(0 0 0 / 4%)"', 'isDark ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.04)"'),
    ('isDark ? "oklch(1 0 0 / 8%)"  : "oklch(0 0 0 / 10%)"', 'isDark ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.10)"'),
    ('isDark ? "oklch(0.65 0.01 270)" : "oklch(0.62 0.010 270)"', 'isDark ? "#99999e" : "#777472"'),
    ('isDark ? "oklch(0.69 0.010 270)" : "oklch(0.69 0.010 270)"', 'isDark ? "#99999e" : "#777472"'),

    # Export item active/inactive style (lines 278-279)
    ('{ background: "oklch(1 0 0 / 5%)", border: `1px solid oklch(1 0 0 / 10%)`, color: "oklch(0.69 0.010 270)" }',
     '{ background: "rgba(255,255,255,0.05)", border: `1px solid rgba(255,255,255,0.10)`, color: "#99999e" }'),
    ('{ background: "oklch(0 0 0 / 4%)", border: `1px solid oklch(0 0 0 / 10%)`, color: "oklch(0.40 0.01 270)" }',
     '{ background: "rgba(0,0,0,0.04)", border: `1px solid rgba(0,0,0,0.10)`, color: "#555555" }'),

    # Selected style highlight (lines 290-291)
    ('background: "oklch(0.58 0.22 290 / 0.15)",', 'background: "rgba(22,22,22,0.15)",'),
    ('border: "1px solid oklch(0.58 0.22 290 / 0.4)",', 'border: "1px solid rgba(22,22,22,0.4)",'),
]

for old, new in replacements:
    content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

# Count remaining
remaining = content.count("oklch")
print(f"Done. Remaining oklch: {remaining}")
