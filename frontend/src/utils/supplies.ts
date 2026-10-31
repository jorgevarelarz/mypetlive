import type { CareSupply, SupplyUnit } from '../api/animals';

// Copia deliberada de `src/utils/supplies.ts` del backend en lo que toca a
// formato: front y back no comparten build. El servidor manda en los cálculos
// (usesLeft, daysLeft); aquí solo se decide cómo se lee.

export const FOOD_UNITS: SupplyUnit[] = ['g', 'kg'];
export const LITTER_UNITS: SupplyUnit[] = ['l', 'kg', 'ud'];

/** 6000 g → "6 kg"; 400 ml → "400 ml". Se sube de unidad a partir de mil. */
export function formatQuantity(baseValue?: number, unit?: SupplyUnit): string {
  if (baseValue === undefined || baseValue === null) return '';
  if (unit === 'ud') return `${Math.round(baseValue * 10) / 10} ud`;
  const volume = unit === 'l' || unit === 'ml';
  const big = volume ? 'l' : 'kg';
  const small = volume ? 'ml' : 'g';
  if (baseValue >= 1000) {
    const value = Math.round((baseValue / 1000) * 10) / 10;
    return `${String(value).replace('.', ',')} ${big}`;
  }
  return `${Math.round(baseValue)} ${small}`;
}

/**
 * Lo que se lee debajo del nombre del producto: "12 comidas · 6 días".
 *
 * Sin ración configurada no dice nada en vez de inventarse un número: la
 * despensa sigue valiendo como lista de nombres para quien no lleve la cuenta.
 */
export function describeSupply(supply: CareSupply, noun: 'comidas' | 'cambios'): string | null {
  if (supply.usesLeft === null) return null;
  const singular = noun === 'comidas' ? 'comida' : 'cambio';
  const uses = `${supply.usesLeft} ${supply.usesLeft === 1 ? singular : noun}`;
  if (supply.daysLeft === null) return uses;
  return `${uses} · ${supply.daysLeft === 1 ? '1 día' : `${supply.daysLeft} días`}`;
}
