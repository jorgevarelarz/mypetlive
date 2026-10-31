module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/__tests__/**/*.test.ts', '**/tests/**/!(*.e2e).test.ts'],
  // Backend integration tests can be slow on CI runners
  testTimeout: 60000,
  // Asegura que Jest salga al finalizar (evita quedarse esperando por handles abiertos)
  forceExit: true,
  // Un solo mongod (standalone + replica set) para toda la batería; cada fichero usa su propia base.
  globalSetup: '<rootDir>/src/__tests__/utils/mongoGlobalSetup.ts',
  globalTeardown: '<rootDir>/src/__tests__/utils/mongoGlobalTeardown.ts',
  // Ignore frontend React tests here; they require a jsdom setup.
  // Frontend tests should run with the frontend tooling/config instead.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/frontend/'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};
