import { DEMO_CHEST } from "./config";
import { refPath } from "./chest-code";

/** Ruta del cofre demo: el de la factory si hay dirección configurada, si no el legacy. */
export const DEMO_PATH = DEMO_CHEST.address
  ? refPath({ kind: "factory", index: DEMO_CHEST.index })
  : refPath({ kind: "legacy", id: DEMO_CHEST.id });
