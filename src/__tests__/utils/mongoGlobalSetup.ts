import { MongoMemoryReplSet, MongoMemoryServer } from 'mongodb-memory-server';
import { ensureMongoBinaryDistro } from './mongoDistro';

// Arranca UN mongod standalone y UN replica set para toda la batería (antes: uno por fichero, ~1,5 s cada uno).
// Los workers heredan las URIs por variables de entorno; cada fichero de test usa su propia base de datos.
export default async function globalSetup(): Promise<void> {
  if (process.env.MONGO_TEST_NO_COMPARTIDO === '1') return;
  ensureMongoBinaryDistro();
  const version = process.env.MONGOMS_VERSION || '7.0.5';
  const [standalone, replSet] = await Promise.all([
    MongoMemoryServer.create({ binary: { version }, instance: { storageEngine: 'wiredTiger', launchTimeout: 60000 } }),
    MongoMemoryReplSet.create({ binary: { version }, replSet: { count: 1, storageEngine: 'wiredTiger' } }),
  ]);
  (globalThis as any).__MONGO_TESTS__ = { standalone, replSet };
  process.env.MONGO_TEST_STANDALONE_URI = standalone.getUri();
  process.env.MONGO_TEST_REPLSET_URI = replSet.getUri();
}
