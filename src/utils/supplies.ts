// Existencias de la despensa: cuánto queda de cada producto y para cuántos usos.
//
// La despensa nació guardando solo nombres ("Acana Adult") para poder marcar la
// comida de un toque. Con el tamaño del paquete y la ración se convierte en algo
// que responde a la pregunta de verdad: **para cuántas comidas queda**. Todo lo
// que aquí se calcula sale de datos que ya se registran; no hay que llevar un
// inventario aparte.

/** Unidades que se escriben en la etiqueta de un saco o una lata. */
export const SUPPLY_UNITS = ['g', 'kg', 'ml', 'l', 'ud'] as const;
export type SupplyUnit = (typeof SUPPLY_UNITS)[number];

type Family = 'mass' | 'volume' | 'count';

// Se guarda todo en la unidad pequeña de cada familia (g, ml, ud) para que
// "saco de 6 kg" y "ración de 80 g" sean la misma magnitud y puedan restarse.
const UNITS: Record<SupplyUnit, { family: Family; factor: number }> = {
  g: { family: 'mass', factor: 1 },
  kg: { family: 'mass', factor: 1000 },
  ml: { family: 'volume', factor: 1 },
  l: { family: 'volume', factor: 1000 },
  ud: { family: 'count', factor: 1 },
};

export function isSupplyUnit(value: unknown): value is SupplyUnit {
  return SUPPLY_UNITS.includes(String(value) as SupplyUnit);
}

export function unitFamily(unit: SupplyUnit): Family {
  return UNITS[unit].family;
}

/** Pasa una cantidad a la unidad base de su familia (kg → g, l → ml). */
export function toBase(value: number, unit: SupplyUnit): number {
  return value * UNITS[unit].factor;
}

/**
 * Cantidad legible: 6000 g → "6 kg", 400 ml → "400 ml".
 *
 * Se sube de unidad solo a partir de mil, que es donde una persona deja de
 * pensar en gramos y empieza a pensar en kilos.
 */
export function formatBase(baseValue: number, unit: SupplyUnit): string {
  const family = unitFamily(unit);
  if (family === 'count') {
    const rounded = Math.round(baseValue * 10) / 10;
    return `${rounded} ud`;
  }
  const big = family === 'mass' ? 'kg' : 'l';
  const small = family === 'mass' ? 'g' : 'ml';
  if (baseValue >= 1000) {
    const value = Math.round((baseValue / 1000) * 10) / 10;
    return `${String(value).replace('.', ',')} ${big}`;
  }
  return `${Math.round(baseValue)} ${small}`;
}

export type SupplyLike = {
  name: string;
  unit?: SupplyUnit;
  /** Lo que trae el paquete, en unidad base. */
  packSize?: number;
  /** Lo que se gasta en cada uso (una ración, un cambio de arena), en unidad base. */
  perUse?: number;
  /** Lo que queda, en unidad base. */
  remaining?: number;
};

const DAY_MS = 24 * 3_600_000;

/**
 * Ritmo de uso a partir de las fechas en que se marcó ese producto.
 *
 * 🔴 Antes esto era `usos / 7` en dos sitios distintos (la ficha y el job de
 * avisos), con la semana clavada. Para una mascota dada de alta anteayer eso
 * divide entre siete días de los que solo existen dos: cuatro comidas apuntadas
 * salían a 0,57 comidas/día en vez de 2, y los "días que quedan" se inflaban
 * hasta 3,5 veces. Como el aviso de "se acaba el pienso" se decide por días, el
 * correo llegaba tarde o no llegaba — y justo a quien acaba de registrarse, que
 * es todo el mundo ahora mismo.
 *
 * Se mide sobre lo observado: desde el primer uso registrado hasta hoy, con un
 * mínimo de un día (dos comidas hoy son dos comidas al día, no infinitas) y un
 * máximo de la ventana que se pasa.
 */
export function usesPerDayFrom(dates: Array<Date | string>, now: Date = new Date(), maxDays = 7): number | undefined {
  if (!dates.length) return undefined;
  const first = dates
    .map(d => new Date(d).getTime())
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b)[0];
  if (first === undefined) return undefined;
  const spanDays = Math.min(maxDays, Math.max(1, Math.ceil((now.getTime() - first) / DAY_MS)));
  return dates.length / spanDays;
}

/**
 * Usos que quedan y días estimados.
 *
 * `usesPerDay` sale del propio registro de cuidado —de lo que se marca— y no de
 * un dato que haya que mantener a mano. Sin ritmo conocido no se inventa una
 * estimación: se devuelve `daysLeft: null` y la tarjeta calla.
 */
export function supplyForecast(supply: SupplyLike, usesPerDay?: number) {
  const { remaining, perUse } = supply;
  // Ojo con el cero: `!remaining` daba "no llevo la cuenta" justo cuando el saco
  // se acaba, que es el único momento en que este número importa de verdad.
  if (remaining === undefined || remaining === null || !perUse || perUse <= 0) {
    return { usesLeft: null, daysLeft: null };
  }
  const usesLeft = Math.floor(remaining / perUse);
  const daysLeft = usesPerDay && usesPerDay > 0 ? Math.floor(usesLeft / usesPerDay) : null;
  return { usesLeft, daysLeft };
}

/** Umbral de "se está acabando": menos de tres usos o menos de dos días. */
export function isRunningLow(forecast: { usesLeft: number | null; daysLeft: number | null }): boolean {
  if (forecast.usesLeft === null) return false;
  if (forecast.usesLeft <= 3) return true;
  return forecast.daysLeft !== null && forecast.daysLeft <= 2;
}
