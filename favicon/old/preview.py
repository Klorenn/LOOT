vs=[("A · white on tile (recommended)","a-white-tile.svg"),("B · proof on tile","b-proof-tile.svg"),("C · plain, light tabs","c-plain-light.svg"),("C · plain, dark tabs","c-plain-dark.svg")]
rows=""
for n,f in vs:
    bg="#F2F2F5" if "light" in f else "#16151C"
    cells="".join(f'<div class=c><div style="background:{bg};padding:10px;border-radius:8px"><img src="{('z-'+f[:-4]+'.png') if s==16 else f}" width={s} height={s}></div><span>{s}px</span></div>' for s in (16,32,64,180))
    zoom=f'<div class=c><div style="background:{bg};padding:10px;border-radius:8px"><img src="z-{f[:-4]}.png" width=16 height=16 style="width:128px;height:128px;image-rendering:pixelated" class=z data-f="{f}"></div><span>16px ×8</span></div>'
    rows+=f'<div class=r><h3>{n}</h3><div class=cs>{cells}{zoom}</div></div>'
def tabs(dark,fs):
    tb="#202124" if dark else "#DEE1E6"; act="#35363A" if dark else "#FFFFFF"; tx="#E8EAED" if dark else "#202124"
    t="".join(f'<div class=tab style="background:{act if i==0 else "transparent"};color:{tx}"><img src="z-{f[:-4]}.png" width=16 height=16>ChestZK · Explore</div>' for i,f in enumerate(fs))
    return f'<div class=bar style="background:{tb}">{t}</div>'
html=f'''<html><head><style>body{{margin:0;padding:40px;background:#0C0B10;color:#fff;font:14px system-ui;width:1200px}}
h1{{font-size:22px;margin:0 0 24px}}h3{{font-weight:500;color:#8A8CFF;margin:0 0 10px}}.r{{margin-bottom:26px}}.cs{{display:flex;gap:22px;align-items:flex-end}}
.c{{display:flex;flex-direction:column;align-items:center;gap:6px}}.c span{{color:#888;font-size:12px}}img{{display:block}}
.bar{{display:flex;gap:2px;padding:8px 8px 0;border-radius:10px 10px 0 0;margin-top:14px}}.tab{{display:flex;gap:8px;align-items:center;padding:9px 14px;border-radius:8px 8px 0 0;font-size:12px;width:190px}}</style></head><body>
<h1>ChestZK — favicon set</h1>{rows}
<h3>Browser tabs · dark</h3>{tabs(1,["a-white-tile.svg","b-proof-tile.svg","c-plain-dark.svg"])}
<h3 style="margin-top:20px">Browser tabs · light</h3>{tabs(0,["a-white-tile.svg","b-proof-tile.svg","c-plain-light.svg"])}
</body></html>'''
open("preview.html","w").write(html)
