import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server';
import { readFileSync } from 'fs';

function ensureMongoBinaryDistro(): void {
  if (process.env.MONGOMS_DISTRO || process.platform !== 'linux') {
    return;
  }

  try {
    const osRelease = readFileSync('/etc/os-release', 'utf8');
    const idMatch = osRelease.match(/^ID="?([^"\n]+)"?/m);
    const versionMatch = osRelease.match(/^VERSION_ID="?([^"\n]+)"?/m);

    const distroId = idMatch?.[1];
    const versionId = versionMatch?.[1];

    if (distroId === 'ubuntu' && versionId) {
      const majorVersion = parseInt(versionId.split('.')[0] ?? '', 10);
      if (!Number.isNaN(majorVersion) && majorVersion >= 24) {
        // Ubuntu 24.04 runners are not yet supported by MongoDB binaries.
        // Fall back to the latest long-term supported build that works across CI environments.
        process.env.MONGOMS_DISTRO = 'ubuntu-22.04';
      }
    }
  } catch {
    // Swallow errors: in constrained CI environments /etc/os-release may be missing.
  }
}

export async function startMongoMemoryServer(): Promise<MongoMemoryServer> {
  ensureMongoBinaryDistro();
  const version = process.env.MONGOMS_VERSION || '7.0.5';
  return MongoMemoryServer.create({
    binary: { version },
    instance: { storageEngine: 'wiredTiger', launchTimeout: 60000 },
  });
}

export async function startMongoMemoryReplicaSet(): Promise<MongoMemoryReplSet> {
  ensureMongoBinaryDistro();
  return MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION || '7.0.5' },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
}
