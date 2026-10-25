import { ClosedChest } from "@/components/landing/closed-chest";
import { XLM_GLYPH } from "@/components/xlm-coins";

const STACK_Y = [146.0, 138.0, 130.0];

/** Creators: cofre dorado cerrado, pila de XLM que entra (.stack), reloj de expiración y link. */
export function CreatorsIllustration() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      width="180"
      height="180"
      aria-hidden
    >
      <ellipse cx="114.0" cy="137.0" rx="47.0" ry="8.4" fill="#000" opacity="0.55" />
      <ClosedChest
        className="chest-closed"
        x={58}
        y={18}
        width={112}
        height={138.4}
        body={["#F7C948", "#D9A92A"]}
        lid={["#FBE3A0", "#F2D178"]}
      />
      <g className="stack">
        {STACK_Y.map((y) => (
          <g key={y}>
            <ellipse cx="34.0" cy={y + 2.9} rx="13" ry="7.5" fill="#BDBDBD" />
            <rect x="21.0" y={y} width="26" height="2.9" fill="#BDBDBD" />
            <ellipse
              cx="34.0"
              cy={y}
              rx="13"
              ry="7.5"
              fill="#FFFFFF"
              stroke="#BDBDBD"
              strokeWidth="1.3"
            />
          </g>
        ))}
        <path
          d={XLM_GLYPH}
          fill="#000000"
          transform="translate(34.0 130.0) scale(0.677 0.393) translate(-12 -12)"
        />
      </g>
      <path
        d="M34 102 L34 114 M28 108 L34 115 L40 108"
        stroke="#A6A1B0"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(148 14)">
        <rect x="0" y="0" width="22" height="4" rx="2" fill="#F5F2EC" />
        <rect x="0" y="28" width="22" height="4" rx="2" fill="#F5F2EC" />
        <path d="M3 4 L19 4 L11 16 Z M3 28 L19 28 L11 16 Z" fill="#44414F" />
        <path d="M7 28 L15 28 L11 22 Z" fill="#F7C948" />
      </g>
      <g
        transform="translate(140 150) rotate(-30)"
        fill="none"
        stroke="#F5F2EC"
        strokeWidth="4"
      >
        <rect x="0" y="0" width="16" height="10" rx="5" />
        <rect x="11" y="0" width="16" height="10" rx="5" />
      </g>
    </svg>
  );
}
