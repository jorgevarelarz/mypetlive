// Topes de importe, espejo de `src/utils/limits.ts` del backend, que es quien
// manda. Aquí solo sirven para poner el `max` del input y explicar el límite
// antes de que la persona lo cruce; si en el servidor se suben por entorno
// (DONATION_MAX_EUR, SALE_MAX_EUR) el mensaje de error que llega trae los
// valores reales y es el que se muestra.
export const DONATION_MIN_EUR = 1;
export const DONATION_MAX_EUR = 2000;
export const SALE_MAX_EUR = 3000;

export function formatEur(n: number): string {
  return n.toLocaleString('es-ES');
}
