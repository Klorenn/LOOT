import math
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
top=Polygon([(16,2),(29,9),(16,16),(3,9)])
left=Polygon([(3,11.4),(15,17.9),(15,30),(3,23.5)])
right=Polygon([(17,17.9),(29,11.4),(29,23.5),(17,30)])
cx,cy,rx,ry=16.48,9,5.6,3.1
t0=math.degrees(math.acos(4.12/5.6))
pts=[(cx+rx*math.cos(math.radians(a)),cy+ry*math.sin(math.radians(a))) for a in [-t0-(360-2*t0)*i/80 for i in range(81)]]
C=LineString(pts).buffer(1.35,cap_style=2)
key=unary_union([Point(9,18.6).buffer(1.6,resolution=24),Polygon([(8.2,19),(9.8,19.9),(9.8,23.6),(8.2,22.7)])])
shapes=[top.difference(C),left.difference(key),right]
def d(g):
    out=""
    gs=getattr(g,'geoms',[g])
    for p in gs:
        for ring in [p.exterior,*p.interiors]:
            c=list(ring.coords)[:-1]
            out+="M"+" L".join(f"{x:.2f} {y:.2f}" for x,y in c)+"Z"
    return out
PATH="".join(d(s) for s in shapes)
