import { Request, Response, NextFunction } from 'express';

/**
 * Filtro general de los textos que entran en la API: quita etiquetas HTML y
 * esquemas de enlace peligrosos de cualquier texto, en cualquier pantalla.
 *
 * Es una segunda capa. La protección principal sigue siendo escapar al pintar:
 * React lo hace solo y los correos y páginas SEO usan `escapeHtml`. Con esto,
 * aunque algún día falle un escape, el código ya no estará guardado.
 *
 * Las contraseñas y tokens no se tocan: cambiarlas en silencio dejaría a la
 * persona sin poder entrar. Un corazón «<3» o «a < b» tampoco se tocan.
 */
const SECRET_KEY = /pass|pwd|secret|token|credential|signature/i;

const BLOCK = /<(script|style|iframe|object|embed)\b[\s\S]*?<\/\1\s*>/gi;
const TAG = /<\/?[a-z!?][^<>]*>/gi;
const OPEN_TAG_WITH_HANDLER = /<[a-z][^<>]*\son\w+\s*=[^<>]*$/i;
const BAD_SCHEME = /^[\s\u0000-\u001f]*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:?/i;

export function cleanText(input: string): string {
  let out = input;
  let previous: string;
  // En bucle: quitar una etiqueta puede formar otra (`<scr<script>ipt>`).
  do {
    previous = out;
    out = out.replace(BLOCK, '').replace(TAG, '').replace(OPEN_TAG_WITH_HANDLER, '').replace(BAD_SCHEME, '');
  } while (out !== previous);
  return out;
}

function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return cleanText(value);
  if (depth > 20 || value === null || typeof value !== 'object' || Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrub(value[i], depth + 1);
    return value;
  }

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!SECRET_KEY.test(key)) obj[key] = scrub(obj[key], depth + 1);
  }
  return obj;
}

export function textSanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body) scrub(req.body);
  if (req.query) scrub(req.query);
  next();
}
