/**
 * Mueve a la zona privada los documentos de verificación subidos antes de AUD-5
 * (FAC-149), que siguen en /uploads (público). Uso, desde la raíz del proyecto
 * y con MONGO_URL apuntando a la base:
 *
 *   npx ts-node scripts/migrar-documentos-verificacion.ts --dry-run   # solo cuenta
 *   npx ts-node scripts/migrar-documentos-verificacion.ts             # lo hace
 *
 * En producción, dentro del contenedor de la API (que monta uploads y
 * uploads-private): docker exec mypetlive_api node dist/scripts/... o con ts-node.
 * Por cada Verification con documentos en /uploads/: copia el fichero a
 * uploads-private como <userId>__<uuid><ext>, comprueba la copia, reescribe
 * fileUrl y solo entonces borra el original. El log solo lleva ids y recuentos.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { Verification } from '../src/models/verification.model';

const SECO = process.argv.includes('--dry-run');
const PUBLICO = path.join(process.cwd(), 'uploads');
const PRIVADO = path.join(process.cwd(), 'uploads-private');

async function main() {
  const uri = process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) throw new Error('Falta MONGO_URL');
  await mongoose.connect(uri);
  fs.mkdirSync(PRIVADO, { recursive: true });
  const vs: any[] = await Verification.find({ 'documents.fileUrl': /\/uploads\// }).lean();
  let movidos = 0; let faltan = 0;
  for (const v of vs) {
    const docs = (v.documents || []).map((d: any) => ({ ...d }));
    let cambio = false;
    for (const d of docs) {
      const m = /\/uploads\/([^/?#]+)$/.exec(String(d.fileUrl || ''));
      if (!m || String(d.fileUrl).includes('/uploads/private/')) continue;
      const origen = path.join(PUBLICO, m[1]);
      if (!fs.existsSync(origen)) { faltan += 1; continue; }
      const ext = path.extname(m[1]).toLowerCase() === '.pdf' ? '.pdf' : '.webp';
      const nombre = `${v.userId}__${randomUUID()}${ext}`;
      if (!SECO) {
        const destino = path.join(PRIVADO, nombre);
        fs.copyFileSync(origen, destino, fs.constants.COPYFILE_EXCL);
        if (fs.statSync(destino).size !== fs.statSync(origen).size) throw new Error(`copia incompleta (verificación ${v._id})`);
      }
      d.fileUrl = `/api/uploads/private/${nombre}`;
      d._origen = origen;
      cambio = true;
      movidos += 1;
    }
    if (cambio && !SECO) {
      const limpios = docs.map(({ _origen, ...resto }: any) => resto);
      await Verification.updateOne({ _id: v._id }, { $set: { documents: limpios } });
      for (const d of docs) if (d._origen) fs.unlinkSync(d._origen);
    }
    console.log(`verificación ${v._id}: ${cambio ? 'documentos movidos' : 'nada que mover'}`);
  }
  console.log(`${SECO ? '[prueba] ' : ''}${vs.length} verificaciones, ${movidos} documentos ${SECO ? 'por mover' : 'movidos'}, ${faltan} sin fichero`);
  await mongoose.disconnect();
}

main().catch(err => { console.error(err.message); process.exit(1); });
