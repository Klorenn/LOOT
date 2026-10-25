import { CHEST_D } from "@/components/logo-chest";
import { XLM_GLYPH, XlmPile } from "@/components/xlm-coins";

/** Players: cofre abierto con XLM, bot bloqueado por el escudo y moneda flotante (.coin). */
export function PlayersIllustration() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 180 180"
      width="180"
      height="180"
      aria-hidden
    >
      <ellipse cx="108.0" cy="141.0" rx="47.0" ry="8.4" fill="#000" opacity="0.55" />
      <svg x="52" y="22" width="112" height="138.4" viewBox="30 -40 340 420">
        <g className="chest-open">
          <path
            d={CHEST_D.opening}
            fill="#050408"
            stroke="#050408"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M339.08 188.24 L223.78 165.34 L229.22 152.91 L344.52 175.81Z"
            fill="#7FE6B8"
            stroke="#7FE6B8"
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <path
            d="M90.26 88.25 L223.78 165.34 L229.22 152.91 L95.70 75.82Z"
            fill="#A6F2CF"
            stroke="#A6F2CF"
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <path
            d="M211.01 98.72 L344.52 175.81 L229.22 152.91 L95.70 75.82Z"
            fill="#F5F2EC"
            stroke="#F5F2EC"
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <path
            d="M226.83 116.84 L158.57 103.29 L215.47 136.15 L231.99 139.43 L194.20 117.61 L245.94 127.88Z"
            fill="#0C0B10"
            stroke="#0C0B10"
            strokeWidth="0"
            strokeLinejoin="round"
          />
          <XlmPile />
          <path d={CHEST_D.bodyL} fill="#4BE3A0" />
          <path d={CHEST_D.bodyR} fill="#2FB57C" />
          <path d={CHEST_D.keyhole} fill="#0C0B10" />
        </g>
      </svg>
      <g className="coin">
        <circle cx="80" cy="27.8" r="11" fill="#BDBDBD" />
        <circle cx="80" cy="26" r="11" fill="#FFFFFF" />
        <path
          d={XLM_GLYPH}
          fill="#000000"
          transform="translate(80 26) scale(0.596) translate(-12 -12)"
        />
      </g>
      <g className="bot">
        <rect x="6" y="112" width="26" height="22" rx="6" fill="#44414F" />
        <rect x="17" y="105" width="4" height="8" rx="2" fill="#44414F" />
        <circle cx="19" cy="104" r="3" fill="#FF5C61" />
        <rect x="11" y="119" width="5" height="5" rx="1.5" fill="#FF5C61" />
        <rect x="22" y="119" width="5" height="5" rx="1.5" fill="#FF5C61" />
        <path d="M34 123 L42 123" stroke="#6F6A7A" strokeWidth="4" strokeLinecap="round" />
      </g>
      <path
        d="M54 108 L66 113 L66 124 C66 132 60 137 54 140 C48 137 42 132 42 124 L42 113 Z"
        fill="#F5F2EC"
      />
      <path
        d="M48 124 L53 129 L61 119"
        stroke="#2FB57C"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
