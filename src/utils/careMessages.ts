import { normalizeSpecies } from './species';

// Textos de los recordatorios de comida, arena y paseos.
//
// Hablan las mascotas: el aviso llega tres veces al día y tiene que apetecer
// leerlo. Si suena a alarma de la caldera, se silencia en una semana. Rotan
// para no repetirse, y ninguno usa adjetivos con género: la ficha no siempre
// dice si es macho o hembra, y «qué hambriento está Luna» chirría.
//
// `{n}` es el nombre (o los nombres) y `{t}` el tiempo que lleva sin marcarse.

export type CareKind = 'feed' | 'walk' | 'litter';
export type CareMode = 'time' | 'late';
type Line = [title: string, body: string];

const FEED_DOG: Line[] = [
  ['{n} tiene una pregunta 🐶', '«¿Eso que suena es mi cuenco? ¿No? ¿Y ahora? ¿Y AHORA?»'],
  ['Hora de comer de {n} 🍗', '«No es por meter prisa, pero llevo esperando desde que nací.»'],
  ['Alerta de tripa vacía 🚨', '{n} lleva un rato mirando el cuenco con mucha intensidad. Mucha.'],
  ['Toc, toc 🐾', '«Soy {n}. Vengo por lo de la comida. Te quiero, pero tengo hambre.»'],
];
const FEED_CAT: Line[] = [
  ['{n} solicita audiencia 🐱', '«Se ve el fondo del cuenco. Eso, para mí, es un cuenco vacío.»'],
  ['Mensaje de {n} 😾', '«Te lo digo con todo el cariño del mundo: me muero de hambre.»'],
  ['Hora de comer de {n} 🍽️', '«Si en cinco minutos no hay comida, empiezo a tirar cosas de la mesa.»'],
  ['{n} te está mirando 👀', '«Fijamente. Desde la cocina. Ya sabes por qué.»'],
];
const FEED_OTHER: Line[] = [
  ['Hora de comer de {n} 🥕', '«Pequeño recordatorio de alguien pequeño con mucha hambre.»'],
  ['{n} te echa de menos 💛', '«Y a la comida también. Sobre todo a la comida.»'],
  ['Aviso de {n} 🍽️', '«Mi tripa ha convocado una reunión urgente. Orden del día: comida.»'],
];
const WALK_DOG: Line[] = [
  ['¿Paseo? ¿PASEO? 🐕', '{n} ha oído la palabra. Ya no hay vuelta atrás.'],
  ['{n} está en la puerta 🦮', '«No digo nada. Solo estoy aquí. Con la correa. Mirándote.»'],
  ['Hora del paseo de {n} 🌳', '«Hay árboles ahí fuera que todavía no he olido. Es urgente.»'],
  ['Reunión importante en el parque 🐾', '«Me esperan tres perros y una farola. No puedo faltar.»'],
];
const LITTER_CAT: Line[] = [
  ['{n} presenta una queja formal 🐱', '«Mi baño no está a la altura de mi categoría.»'],
  ['Toca cambiar la arena 🧹', '«Yo no digo nada, pero mi arenero sí. Y se le oye desde el salón.»'],
  ['Asunto delicado 😼', '«Hablemos del arenero. O mejor no hablemos: cámbialo.»'],
];
const LITTER_OTHER: Line[] = [
  ['Toca limpiar el rincón de {n} 🧹', '«Casa limpia, mascota feliz. Lo he leído en algún sitio.»'],
  ['{n} pide limpieza 🧽', '«Te dejo el sitio como lo encontraste… no. Te toca a ti.»'],
];

// Varias mascotas a la vez: un solo aviso, y en plural.
const GROUP: Record<CareKind, Line[]> = {
  feed: [
    ['{n} han montado un sindicato 🪧', '«Exigimos comida. Ya. Gracias. Te queremos.»'],
    ['Hora de comer en casa 🍽️', '{n} esperan en fila. Bueno, en fila no. Pero esperan.'],
    ['Coro de tripas 🎶', '{n} cantan a dúo. La canción se llama «¿y lo mío?».'],
  ],
  walk: [
    ['Excursión en grupo 🐕🐕', '{n} ya han votado: paseo. Por unanimidad.'],
    ['{n} están en la puerta 🦮', '«Venimos todos. Es innegociable.»'],
  ],
  litter: [
    ['Toca limpiar 🧹', '{n} piden, con elegancia, un baño en condiciones.'],
    ['Comité de limpieza 😼', '«Estimado humano: el arenero. Atentamente, {n}.»'],
  ],
};

// «Por olvido»: no sabemos si se ha olvidado de darle de comer o de apuntarlo,
// así que se pregunta con cariño, sin regañar.
const LATE: Record<CareKind, Line[]> = {
  feed: [
    ['¿Ha comido {n}? 🤔', '«Hace {t} que no me apuntas la comida. ¿Me la diste y se te olvidó marcarla? Te perdono.»'],
    ['{n} tiene una duda 🍽️', '«Hace {t} de mi última comida apuntada. Yo creo que me toca. Lo creo mucho.»'],
  ],
  walk: [
    ['{n} se pregunta por el paseo 🐕', '«Hace {t} que no salimos. ¿O salimos y no lo apuntaste? Ya no me acuerdo de nada.»'],
    ['¿Y ese paseo? 🌳', '«Hace {t} sin paseo apuntado. Las farolas del barrio preguntan por mí.»'],
  ],
  litter: [
    ['El arenero de {n} pide atención 🧹', '«Hace {t} que no lo cambias. O eso dice la app. Yo solo lo huelo.»'],
    ['Recordatorio delicado 😼', '«{n} aquí. Hace {t} sin arena nueva. No digo más.»'],
  ],
};

function speciesLines(kind: CareKind, species?: string): Line[] {
  const s = normalizeSpecies(species);
  if (kind === 'walk') return WALK_DOG;
  if (kind === 'litter') return s === 'cat' ? LITTER_CAT : LITTER_OTHER;
  if (s === 'dog') return FEED_DOG;
  if (s === 'cat') return FEED_CAT;
  return FEED_OTHER;
}

/** «Luna», «Luna y Toby», «Luna, Toby y Nala». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] || 'tu mascota';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** «14 h», «3 días». */
export function elapsedLabel(hours: number): string {
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} días`;
}

/**
 * El aviso para una o varias mascotas. `seed` elige la variante (cambia con el
 * día y la hora, así que no se repite la misma dos veces seguidas).
 */
export function careMessage(
  kind: CareKind,
  mode: CareMode,
  pets: Array<{ name?: string; species?: string }>,
  seed: number,
  hoursSince?: number,
): { title: string; body: string } {
  const names = pets.map(p => p.name || 'tu mascota');
  let lines: Line[];
  if (mode === 'late') lines = LATE[kind];
  else if (pets.length > 1) lines = GROUP[kind];
  else lines = speciesLines(kind, pets[0]?.species);

  const [title, body] = lines[Math.abs(seed) % lines.length];
  const fill = (text: string) =>
    text.replace(/\{n\}/g, joinNames(names)).replace(/\{t\}/g, elapsedLabel(hoursSince ?? 0));
  return { title: fill(title), body: fill(body) };
}
