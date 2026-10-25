import { ClosedChest } from "@/components/landing/closed-chest";

type Face = { d: string; fill: string };

/** Placa de código isométrica (laterales + tapa oscura). */
const SLAB: Face[] = [
  { d: "M29.50 90.16 L92.55 126.56 L92.55 134.40 L29.50 98.00 Z", fill: "#8A8CFF" },
  { d: "M141.05 98.56 L92.55 126.56 L92.55 134.40 L141.05 106.40 Z", fill: "#5B5EE8" },
  { d: "M78.00 62.16 L141.05 98.56 L92.55 126.56 L29.50 90.16 Z", fill: "#1B1A23" },
];

/** Líneas de código sobre la placa. */
const CODE: Face[] = [
  { d: "M77.3 71.3 L91.8 79.7", fill: "#8A8CFF" },
  { d: "M69.6 75.8 L109.3 98.7", fill: "#F5F2EC" },
  { d: "M73.2 86.8 L114.1 110.5", fill: "#4BE3A0" },
  { d: "M65.4 91.3 L84.3 102.2", fill: "#A6A1B0" },
  { d: "M46.3 89.2 L70.2 103.0", fill: "#F7C948" },
];

/** Cubo (contrato) conectado a la placa. */
const CUBE: Face[] = [
  { d: "M136.68 126.00 L154.00 136.00 L154.00 156.00 L136.68 146.00 Z", fill: "#8A8CFF" },
  { d: "M171.32 126.00 L154.00 136.00 L154.00 156.00 L171.32 146.00 Z", fill: "#5B5EE8" },
  { d: "M154.00 116.00 L171.32 126.00 L154.00 136.00 L136.68 126.00 Z", fill: "#C9CAFF" },
];

const solid = (f: Face) => (
  <path
    key={f.d}
    d={f.d}
    fill={f.fill}
    stroke={f.fill}
    strokeWidth="3"
    strokeLinejoin="round"
  />
);

/** Builders: placa de código, contrato y un cofre Loot cableado al circuito. */
export function BuildersIllustration() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      width="180"
      height="180"
      aria-hidden
    >
      <ellipse cx="83" cy="134" rx="59" ry="13" fill="#000" opacity="0.55" />
      {SLAB.map(solid)}
      {CODE.map((c) => (
        <path key={c.d} d={c.d} stroke={c.fill} strokeWidth="4" strokeLinecap="round" />
      ))}
      <path
        d="M114.4 117.9 L132 132 L132 150 L146 150"
        stroke="#44414F"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {CUBE.map(solid)}
      <ellipse cx="39.0" cy="157.1" rx="21.0" ry="3.8" fill="#000" opacity="0.55" />
      <ClosedChest
        x={14}
        y={104}
        width={50}
        height={61.8}
        body={["#8A8CFF", "#5B5EE8"]}
        lid={["#C9CAFF", "#A9ABFF"]}
      />
      <path
        d="M58 152 L120 152"
        stroke="#44414F"
        strokeWidth="3"
        strokeDasharray="2 5"
        strokeLinecap="round"
      />
    </svg>
  );
}
