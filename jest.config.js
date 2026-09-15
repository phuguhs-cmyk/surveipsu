/**
 * Konfigurasi Jest untuk project ini, dibagi menjadi 2 "project":
 *
 * 1. `unit` — unit test murni untuk logika (utils & service layer) tanpa
 *    perlu environment React Native sungguhan. Modul native RN/Expo yang
 *    dipakai oleh service layer (authService/apiService) di-mock secara
 *    manual (lihat test/mocks/*) via moduleNameMapper di bawah.
 * 2. `component` — test render komponen/screen (mis. LoginScreen) memakai
 *    preset resmi `jest-expo` + `@testing-library/react-native`, sehingga
 *    modul React Native asli benar-benar dirender (bukan mock manual).
 */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      clearMocks: true,
      setupFiles: ['<rootDir>/test/setupEnv.js'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
      },
      moduleNameMapper: {
        '^react-native$': '<rootDir>/test/mocks/react-native.js',
        '^@react-native-async-storage/async-storage$': '<rootDir>/test/mocks/async-storage.js',
        '^expo-constants$': '<rootDir>/test/mocks/expo-constants.js',
        '^expo-network$': '<rootDir>/test/mocks/expo-network.js',
        '^expo-file-system/legacy$': '<rootDir>/test/mocks/expo-file-system-legacy.js',
      },
    },
    {
      displayName: 'component',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      clearMocks: true,
      setupFiles: ['<rootDir>/test/setupEnv.js'],
      setupFilesAfterEnv: ['<rootDir>/test/setupComponentTests.js'],
    },
  ],
};

