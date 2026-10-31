import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ensureMongoBinaryDistro } from './mongoDistro';

// Lo que usan los tests de un servidor de Mongo: su URI y pararlo al acabar.
export interface TestMongo {
  getUri(): string;
  stop(): Promise<unknown>;
}

let contador = 0;

// Base propia de cada fichero dentro del mongod compartido (ver mongoGlobalSetup.ts).
function baseCompartida(uri: string): TestMongo {
  const nombre = `t${process.env.JEST_WORKER_ID || '0'}_${process.pid}_${Date.now().toString(36)}_${contador++}`;
  const conBase = uri.replace(/\/(\?|$)/, `/${nombre}$1`);
  return {
    getUri: () => conBase,
    // El mongod es de toda la batería: aquí no se para. La base de este fichero muere con él al final.
    stop: async () => undefined,
  };
}

// Devuelven el tipo de mongodb-memory-server para no tocar los tests que lo declaran; solo usan getUri() y stop().
export async function startMongoMemoryServer(): Promise<MongoMemoryServer> {
  const compartido = process.env.MONGO_TEST_STANDALONE_URI;
  if (compartido) return baseCompartida(compartido) as unknown as MongoMemoryServer;
  ensureMongoBinaryDistro();
  const version = process.env.MONGOMS_VERSION || '7.0.5';
  return MongoMemoryServer.create({
    binary: { version },
    instance: { storageEngine: 'wiredTiger', launchTimeout: 60000 },
  });
}

export async function startMongoMemoryReplicaSet(): Promise<MongoMemoryReplSet> {
  const compartido = process.env.MONGO_TEST_REPLSET_URI;
  if (compartido) return baseCompartida(compartido) as unknown as MongoMemoryReplSet;
  ensureMongoBinaryDistro();
  return MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION || '7.0.5' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
}

// Deja la base vacía entre tests. Vaciar las colecciones cuesta ~10-20 ms; dropDatabase, ~100 ms o más,
// y además borra los índices (los únicos dejaban de comprobarse tras el primer test).
export async function limpiarBase(): Promise<void> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return;
  const colecciones = await db.collections();
  await Promise.all(colecciones.map(c => c.deleteMany({})));
}
