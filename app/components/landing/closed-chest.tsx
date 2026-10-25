import { CHEST_D, LID } from "@/components/logo-chest";
import { CLOSED_LID_TRANSFORM } from "@/lib/chest-hinge";

type Props = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Caras del cuerpo [izq, der] y laterales de la tapa [izq, der]. */
  body: [string, string];
  lid: [string, string];
  className?: string;
};

/** Cofre cerrado estático para ilustraciones (sin bisagra ni interior). */
export function ClosedChest({ x, y, width, height, body, lid, className }: Props) {
  return (
    <svg className={className} x={x} y={y} width={width} height={height} viewBox="30 -40 340 420">
      <path d={CHEST_D.bodyL} fill={body[0]} />
      <path d={CHEST_D.bodyR} fill={body[1]} />
      <path d={CHEST_D.keyhole} fill="#0C0B10" />
      <g className="lid">
        {LID.map((p, i) => (
          <path
            key={i}
            data-k={p.k}
            d={p.d}
            fill={p.k === "L" ? lid[0] : p.k === "R" ? lid[1] : p.fill}
            transform={CLOSED_LID_TRANSFORM}
          />
        ))}
      </g>
    </svg>
  );
}
