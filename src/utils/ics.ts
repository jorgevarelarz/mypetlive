// Generación de feeds iCalendar (RFC 5545) para suscripción externa.
// Google/Apple/Outlook consultan la URL del feed periódicamente y sincronizan
// solos: los eventos con STATUS:CANCELLED desaparecen del calendario suscrito.

export type IcsEvent = {
  uid: string;
  start: Date;
  end?: Date;
  summary: string;
  description?: string;
  status?: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
  updatedAt?: Date;
};

const pad = (n: number) => String(n).padStart(2, '0');

// Fecha/hora en UTC compacto: 20260703T101500Z
export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Escapa texto de propiedades según RFC 5545 §3.3.11.
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Pliega líneas largas a 75 octetos con continuación " " (RFC 5545 §3.1).
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    if (Buffer.byteLength(current + ch, 'utf8') > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000;

export function buildCalendar(name: string, events: IcsEvent[]): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyPetLive//Citas veterinarias//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'X-WR-TIMEZONE:Europe/Madrid',
    // Sugerencia de refresco para los proveedores que la respetan.
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  for (const ev of events) {
    const stamp = ev.updatedAt || now;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsText(ev.uid)}`,
      `DTSTAMP:${icsDate(stamp)}`,
      `LAST-MODIFIED:${icsDate(stamp)}`,
      // SEQUENCE creciente con cada cambio para que el proveedor aplique la actualización.
      `SEQUENCE:${Math.floor(stamp.getTime() / 1000) % 2147483647}`,
      `DTSTART:${icsDate(ev.start)}`,
      `DTEND:${icsDate(ev.end || new Date(ev.start.getTime() + DEFAULT_DURATION_MS))}`,
      `SUMMARY:${icsText(ev.summary)}`,
      ...(ev.description ? [`DESCRIPTION:${icsText(ev.description)}`] : []),
      `STATUS:${ev.status || 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
