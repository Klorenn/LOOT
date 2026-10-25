/** Isometric lid hinge — matches chestzk-proto-v7 `window.Chest`. */

const c = Math.cos(Math.PI / 6);
const YP = 168.6;
const XP = 168.6;
const Y0 = 0;
const ZH = -34.6;
const DROP = 33;

export type LidKey = "L" | "R" | "top";

const proj = (X: number, Y: number, Z: number): [number, number] => [
  200 + (X - Y) * c,
  40 + (X + Y) / 2 - Z,
];

const inv = (
  k: LidKey,
  sx: number,
  sy: number,
): [number, number, number] => {
  if (k === "top") {
    const u = (sx - 200) / c;
    const v = 2 * (sy - 40);
    return [(u + v) / 2, (v - u) / 2, 0];
  }
  if (k === "L") {
    const X = YP + (sx - 200) / c;
    return [X, YP, 40 + (X + YP) / 2 - sy];
  }
  const Y = XP - (sx - 200) / c;
  return [XP, Y, 40 + (XP + Y) / 2 - sy];
};

/** SVG matrix() for a lid piece at angle `deg` (0 = sealed, 30 = open). */
export function lidMatrix(k: LidKey, deg: number): number[] {
  const th = (deg * Math.PI) / 180;
  const f = (sx: number, sy: number) => {
    let [X, Y, Z] = inv(k, sx, sy);
    Z -= DROP;
    const zh = ZH - DROP;
    const dy = Y - Y0;
    const dz = Z - zh;
    return proj(
      X,
      Y0 + dy * Math.cos(th) - dz * Math.sin(th),
      zh + dy * Math.sin(th) + dz * Math.cos(th),
    );
  };
  const o = f(0, 0);
  const a = f(1, 0);
  const b = f(0, 1);
  return [a[0] - o[0], a[1] - o[1], b[0] - o[0], b[1] - o[1], o[0], o[1]];
}

export function lidTransform(k: LidKey, deg: number): string {
  return `matrix(${lidMatrix(k, deg).map((n) => n.toFixed(4)).join(",")})`;
}

/** Closed flush transform used for SSR / logo marks. */
export const CLOSED_LID_TRANSFORM = "matrix(1,0,0,1,0,33)";

export function setChest(svg: SVGSVGElement, deg: number) {
  svg.querySelectorAll<SVGPathElement>(".lid path").forEach((p) => {
    const k = (p.dataset.k || "top") as LidKey;
    p.setAttribute("transform", lidTransform(k, deg));
  });
  const inside = svg.querySelector(".inside");
  if (inside) {
    inside.setAttribute("opacity", String(Math.min(1, deg / 6)));
  }
}
