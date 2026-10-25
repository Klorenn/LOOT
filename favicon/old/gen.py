# ChestZK favicon generator (32-unit grid, solid faces, C cutout in lid)
from geom import PATH
def mark(fill, pad=0, tile=None, rx=7, cid="c"):
    # geometry in 32x32
    top="M16 2 L29 9 L16 16 L3 9 Z"
    left="M3 11.4 L15 17.9 L15 30 L3 23.5 Z"
    right="M17 17.9 L29 11.4 L29 23.5 L17 30 Z"
    # C: iso ellipse arc on lid, open to the right-front
    C="M20.6 6.9 A5.6 3.1 0 1 0 20.6 11.1"
    key='<circle cx="9" cy="18.6" r="1.6"/><path d="M8.2 19 L9.8 19.9 L9.8 23.6 L8.2 22.7 Z"/>'
    m=(f'<mask id="{cid}" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">'
       f'<rect width="32" height="32" fill="#fff"/><path d="{C}" fill="none" stroke="#000" stroke-width="2.7" stroke-linecap="butt"/>'
       f'<g fill="#000">{key}</g></mask>')
    m=""; g=f'<path fill="{fill}" fill-rule="evenodd" d="{PATH}"/>'
    if pad:
        s=(32-2*pad)/32; g=f'<g transform="translate({pad} {pad}) scale({s})">{g}</g>'
    bg=f'<rect width="32" height="32" rx="{rx}" fill="{tile}"/>' if tile else ''
    return m,bg+g
def svg(fill,tile=None,pad=0,extra=""):
    m,b=mark(fill,pad,tile)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">{extra}{b}</svg>'
V={
 "a-white-tile": svg("#FFFFFF","#0C0B10",pad=3),
 "b-proof-tile": svg("#8A8CFF","#0C0B10",pad=3),
 "c-plain-light": svg("#0C0B10"),
 "c-plain-dark": svg("#FFFFFF"),
}
# adaptive favicon.svg: plain mark, dark ink in light tabs, white in dark tabs
m,b=mark("currentColor")
V["favicon"]=('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>svg{color:#0C0B10}@media (prefers-color-scheme:dark){svg{color:#FFFFFF}}</style>'
  f'{b}</svg>')
for k,v in V.items():
    if k!="favicon": open(k+".svg","w").write(v)
