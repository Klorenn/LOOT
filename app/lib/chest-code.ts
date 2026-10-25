import Sqids from "sqids";

/**
 * URLs de cofre con aspecto aleatorio: /chest/<code>, donde code = Sqids(id).
 *
 * Solo ofuscación: los cofres son enumerables on-chain (ids 1, 2, 3… en el contrato), así que
 * esto evita links "adivinables" y cuentas visibles en la URL, no oculta nada. No es seguridad.
 *
 * El alfabeto es un barajado fijo de minúsculas + dígitos: cambiarlo cambia TODOS los códigos y
 * rompe los links ya compartidos. Cofres de la factory (direcciones de contrato) quedan fuera.
 */
const ALPHABET = "tzgqv5iywm3e4s62r7bc8fnoup1jhald9x0k";
const MIN_LENGTH = 8;

const sqids = new Sqids({ alphabet: ALPHABET, minLength: MIN_LENGTH });

export function encodeChestId(id: number): string {
  if (!Number.isSafeInteger(id) || id < 0) throw new Error(`bad chest id ${id}`);
  return sqids.encode([id]);
}

/** Código → id, o null si no es un código canónico válido (rechaza variantes que decodifican igual). */
export function decodeChestId(code: string): number | null {
  if (!/^[a-z0-9]{8,32}$/.test(code)) return null;
  const nums = sqids.decode(code);
  if (nums.length !== 1) return null;
  const id = nums[0];
  return sqids.encode([id]) === code ? id : null;
}

/** Ruta pública de un cofre. */
export const chestPath = (id: number) => `/chest/${encodeChestId(id)}`;

/**
 * Referencia a un cofre: legacy (id numérico en el contrato registry) o de la factory
 * (posición en `list_chests`; la dirección del contrato se resuelve on-chain).
 * Códigos: legacy = Sqids([id]) (sin cambios, los links viejos siguen vivos),
 * factory = Sqids([1, index]).
 */
export type ChestRef = { kind: "legacy"; id: number } | { kind: "factory"; index: number };

export function encodeRef(ref: ChestRef): string {
  if (ref.kind === "legacy") return encodeChestId(ref.id);
  if (!Number.isSafeInteger(ref.index) || ref.index < 0) throw new Error(`bad factory index ${ref.index}`);
  return sqids.encode([1, ref.index]);
}

export function decodeRef(code: string): ChestRef | null {
  if (!/^[a-z0-9]{8,32}$/.test(code)) return null;
  const nums = sqids.decode(code);
  if (nums.length === 1) {
    return sqids.encode([nums[0]]) === code ? { kind: "legacy", id: nums[0] } : null;
  }
  if (nums.length === 2 && nums[0] === 1) {
    return sqids.encode(nums) === code ? { kind: "factory", index: nums[1] } : null;
  }
  return null;
}

export const refPath = (ref: ChestRef) => `/chest/${encodeRef(ref)}`;
export const factoryPath = (index: number) => refPath({ kind: "factory", index });
