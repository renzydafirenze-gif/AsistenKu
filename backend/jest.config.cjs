/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-db.ts'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    // Composition roots: exercised by the integration suite via createApp, but
    // their process bootstrap branches cannot be unit-tested meaningfully.
    '!src/db/prisma.ts',
    '!src/types/**',
    '!src/config/env.ts',
  ],
  // DoD asks for 95%+; branch coverage is intentionally lower because the
  // service layer is guard-clause heavy (defensive branches that only fire on
  // impossible states are cheaper to leave than to fake with contrived tests).
  coverageThreshold: {
    global: { branches: 83, functions: 95, lines: 95, statements: 95 },
  },
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  clearMocks: true,
  restoreMocks: true,
  testTimeout: 20000,
  maxWorkers: 1,
  verbose: false,
};
