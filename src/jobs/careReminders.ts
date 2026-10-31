import { Animal } from '../models/animal.model';
import { User } from '../models/user.model';
import { sendPushToUser } from '../utils/push';
import { normalizeSpecies } from '../utils/species';
import { careMessage, type CareKind } from '../utils/careMessages';
import logger from '../utils/logger';

// Recordatorios de comida, arena y paseos. Solo notificación al móvil: un
// correo tres veces al día es spam, y esto solo sirve si llega en el momento.
//
// Dos maneras, por tipo y por mascota:
// - Con horas (`careReminders.feed.times = ['08:00', '20:00']`): avisa a esa
//   hora, salvo que ya esté marcado desde poco antes.
// - Sin horas: «por olvido». Si lleva demasiado sin marcarse, pregunta una vez.
//   Solo a quien está usando el registro (algo marcado en las dos últimas
//   semanas): a quien nunca marca nada le diríamos cada día que su perro lleva
//   un mes sin comer.
//
// Si a varias mascotas de la misma familia les toca lo mismo en la misma
// pasada, sale UN aviso con todas: cinco notificaciones seguidas a las 20:00 es
// la forma más rápida de que alguien las desactive.

const TZ = 'Europe/Madrid';
// La pasada corre cada 5 minutos; el margen cubre una pasada perdida (reinicio).
const SLOT_WINDOW_MIN = 30;
// «Ya lo ha hecho»: marcado desde 90 minutos antes de la hora cuenta.
const DONE_BEFORE_MIN = 90;
const LATE_HOURS: Record<CareKind, number> = { feed: 14, walk: 12, litter: 72 };
const ACTIVE_DAYS = 14;
// «Por olvido» nunca de madrugada: ahí no hay prisa que valga un despertar.
const QUIET_FROM_MIN = 21 * 60 + 30;
const QUIET_UNTIL_MIN = 9 * 60;

const H_MS = 3_600_000;
const LAST_FIELD: Record<CareKind, 'lastFeeding' | 'lastWalk' | 'lastLitterChange'> = {
  feed: 'lastFeeding',
  walk: 'lastWalk',
  litter: 'lastLitterChange',
};

/** Fecha y minuto del día en hora española. */
export function madridClock(now: Date): { ymd: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Qué cuidados tienen sentido para esta especie (lo mismo que enseña la tarjeta). */
export function careKindsFor(species?: string): CareKind[] {
  const s = normalizeSpecies(species);
  const kinds: CareKind[] = ['feed'];
  if (s === 'dog') kinds.push('walk');
  if (s === 'cat' || s === 'rabbit' || s === 'conejo') kinds.push('litter');
  return kinds;
}

type Pending = { ownerId: string; kind: CareKind; animal: any; mode: 'time' | 'late'; hoursSince?: number };

/**
 * Hueco de hoy que acaba de pasar (dentro de la ventana), o null. Devuelve la
 * clave para no avisar dos veces y la hora real del hueco.
 */
function dueSlot(times: string[], clock: { ymd: string; minutes: number }, now: Date) {
  for (const t of times) {
    const diff = clock.minutes - toMinutes(t);
    if (diff >= 0 && diff < SLOT_WINDOW_MIN) {
      return { key: `${clock.ymd} ${t}`, at: new Date(now.getTime() - diff * 60_000) };
    }
  }
  return null;
}

/**
 * Una pasada. Devuelve cuántas notificaciones ha enviado (un aviso agrupado
 * cuenta como una).
 */
export async function sendCareReminders(now = new Date()): Promise<number> {
  const clock = madridClock(now);
  const activeSince = new Date(now.getTime() - ACTIVE_DAYS * 24 * H_MS);
  const animals = await Animal.find({
    ownerId: { $ne: null },
    status: { $ne: 'archivado' },
    // Despedida: ni un aviso más (ver memorial.controller).
    'memorial.active': { $ne: true },
    $or: [
      { 'careReminders.feed.times.0': { $exists: true } },
      { 'careReminders.walk.times.0': { $exists: true } },
      { 'careReminders.litter.everyDays': { $gt: 0 } },
      { lastFeeding: { $gte: activeSince } },
      { lastWalk: { $gte: activeSince } },
      { lastLitterChange: { $gte: activeSince } },
    ],
  })
    .select('name species ownerId careReminders lastFeeding lastWalk lastLitterChange')
    .lean();
  if (!animals.length) return 0;

  // Solo familias: si una adopción se revierte el animal vuelve a la protectora
  // (ownerId = protectora), y a una protectora con 40 animales no se le manda
  // un chiste por cada cuenco.
  const owners = await User.find({ _id: { $in: animals.map(a => a.ownerId) }, role: 'tenant' }).select('_id').lean();
  const families = new Set(owners.map(o => String(o._id)));

  const pending: Pending[] = [];
  for (const animal of animals as any[]) {
    const ownerId = String(animal.ownerId);
    if (!families.has(ownerId)) continue;
    const cfg = animal.careReminders || {};
    const sent = cfg.sent || {};
    const set: Record<string, unknown> = {};

    for (const kind of careKindsFor(animal.species)) {
      const rule = cfg[kind] || {};
      if (rule.off) continue;
      const last: Date | undefined = animal[LAST_FIELD[kind]] ? new Date(animal[LAST_FIELD[kind]]) : undefined;

      // ---- Con horario
      const times: string[] =
        kind === 'litter' ? (rule.everyDays ? [rule.time || '19:00'] : []) : rule.times || [];
      if (times.length) {
        const slot = dueSlot(times, clock, now);
        if (!slot || sent[`${kind}Slot`] === slot.key) continue;
        set[`careReminders.sent.${kind}Slot`] = slot.key;
        let done = Boolean(last && last.getTime() >= slot.at.getTime() - DONE_BEFORE_MIN * 60_000);
        if (kind === 'litter' && last) {
          // Arena «cada N días»: no toca si se cambió hace menos de N días (con
          // unas horas de margen: cambiarla a las 18:00 cuenta para las 19:00).
          done = now.getTime() - last.getTime() < rule.everyDays * 24 * H_MS - 3 * H_MS;
        }
        if (!done) pending.push({ ownerId, kind, animal, mode: 'time' });
        continue;
      }

      // ---- Por olvido
      if (!last || last < activeSince) continue;
      if (clock.minutes >= QUIET_FROM_MIN || clock.minutes < QUIET_UNTIL_MIN) continue;
      const hoursSince = (now.getTime() - last.getTime()) / H_MS;
      if (hoursSince < LATE_HOURS[kind]) continue;
      // Uno por despiste: si ya se avisó después de la última marca, no se repite.
      const lateAt = sent[`${kind}Late`] ? new Date(sent[`${kind}Late`]) : null;
      if (lateAt && lateAt > last) continue;
      set[`careReminders.sent.${kind}Late`] = now;
      pending.push({ ownerId, kind, animal, mode: 'late', hoursSince });
    }

    // Se marca antes de enviar, como el resto de recordatorios: perder un aviso
    // es mejor que repetirlo cada cinco minutos si APNs falla.
    if (Object.keys(set).length) await Animal.updateOne({ _id: animal._id }, { $set: set });
  }

  // Agrupar: misma familia, mismo cuidado y con horario → un aviso.
  const groups = new Map<string, Pending[]>();
  for (const p of pending) {
    const key = p.mode === 'time' ? `${p.ownerId}:${p.kind}` : `${p.ownerId}:${p.kind}:${p.animal._id}`;
    groups.set(key, [...(groups.get(key) || []), p]);
  }

  const seed = Math.floor(now.getTime() / H_MS);
  let sent = 0;
  for (const group of groups.values()) {
    const { ownerId, kind, mode, hoursSince } = group[0];
    const pets = group.map(p => ({ name: p.animal.name, species: p.animal.species }));
    const msg = careMessage(kind, mode, pets, seed + kind.length, hoursSince);
    try {
      await sendPushToUser(ownerId, { ...msg, url: `/pet?mascota=${group[0].animal._id}` });
      sent += 1;
    } catch (err) {
      logger.error({ err, ownerId, kind }, '[cuidado] fallo al enviar recordatorio');
    }
  }
  if (sent) logger.info({ sent }, '[cuidado] recordatorios enviados');
  return sent;
}
