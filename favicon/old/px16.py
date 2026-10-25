from PIL import Image
P="""................
.......WW.......
.....WWWWWW.....
...WWW....WWW...
.WWW..WWWWWWWWW.
...WWW....WWW...
.WW..WWWWWW..WW.
.WWWW..WW..WWWW.
.WWWWWW..WWWWWW.
.WWWWWW..WWWWWW.
.WWWWWW..WWWWWW.
.WWWWWW..WWWWWW.
.WWWWWW..WWWWWW.
...WWWW..WWWW...
.....WW..WW.....
................""".split()
def make(ink,tile,out):
    im=Image.new("RGBA",(16,16),(0,0,0,0))
    for y,row in enumerate(P):
        for x,c in enumerate(row):
            if tile: im.putpixel((x,y),tile)
            if c=="W": im.putpixel((x,y),ink)
    if tile:
        for x,y in [(0,0),(15,0),(0,15),(15,15)]: im.putpixel((x,y),(0,0,0,0))
    im.save(out)
h=lambda s:tuple(int(s[i:i+2],16) for i in (1,3,5))+(255,)
make(h("#FFFFFF"),h("#0C0B10"),"z-a-white-tile.png")
make(h("#8A8CFF"),h("#0C0B10"),"z-b-proof-tile.png")
make(h("#0C0B10"),None,"z-c-plain-light.png")
make(h("#FFFFFF"),None,"z-c-plain-dark.png")
def pxsvg(ink,tile,media=False):
    d="".join(f"M{x} {y}h1v1h-1z" for y,r in enumerate(P) for x,c in enumerate(r) if c=="W")
    bg=f'<rect width="16" height="16" rx="1.5" fill="{tile}"/>' if tile else ""
    st='<style>path{fill:#0C0B10}@media (prefers-color-scheme:dark){path{fill:#FFFFFF}}</style>' if media else ""
    f="" if media else f' fill="{ink}"'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">{st}{bg}<path{f} d="{d}"/></svg>'
open("favicon.svg","w").write(pxsvg("#FFFFFF","#0C0B10"))
open("favicon-adaptive.svg","w").write(pxsvg(None,None,True))
open("px-b-proof-tile.svg","w").write(pxsvg("#8A8CFF","#0C0B10"))
