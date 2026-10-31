import { Request, Response, NextFunction } from 'express';

/**
 * Defensa en profundidad contra inyección de operadores de MongoDB.
 *
 * Muchos controladores construyen el filtro copiando valores tal cual:
 * `if (req.query.species) filter.species = req.query.species`. Express parsea
 * `?species[$ne]=x` como el objeto `{ $ne: 'x' }`, así que sin esto un cliente
 * puede colar operadores (`$ne`, `$gt`, `$where`, `$regex`…) en cualquier
 * consulta que no valide con Zod/express-validator. El login ya está a salvo
 * (`isEmail()`), pero el catálogo, los filtros y varios `findOne` no.
 *
 * En vez de rechazar la petición, se limpian en el sitio las claves peligrosas:
 *  - las que empiezan por `$` (operador de Mongo),
 *  - las que contienen `.` (notación de camino: `a.b` alcanza subdocumentos).
 *
 * Solo toca las CLAVES de objetos anidados en body/query/params. Los valores
 * string (nombres con `$`, etc.) no se tocan. Express 4 permite reescribir
 * `req.query` in situ; en Express 5 habría que clonar.
 */
const FORBIDDEN_KEY = /^\$|\./;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1);
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete obj[key];
      continue;
    }
    obj[key] = scrub(obj[key], depth + 1);
  }
  return obj;
}

export function mongoSanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body) scrub(req.body);
  if (req.query) scrub(req.query);
  if (req.params) scrub(req.params);
  next();
}
