// Escapa un texto para usarlo como literal dentro de un $regex de Mongo.
//
// Sin esto, cualquier búsqueda que contenga un carácter especial de expresión
// regular rompe la consulta: escribir "(" en un buscador hace que Mongo
// devuelva "Regular expression is invalid" y la petición acaba en 500. También
// evita que un patrón patológico (p. ej. "(a+)+$") se ejecute contra la
// colección entera.
export function escapeRegex(input: string): string {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
