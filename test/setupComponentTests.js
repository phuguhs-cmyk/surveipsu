// Setup tambahan khusus project "component" (test render screen/komponen),
// dijalankan setelah environment test (jest-expo) siap tapi sebelum file
// test dieksekusi. `@testing-library/react-native` otomatis menambahkan
// jest matcher (mis. toBeOnTheScreen) begitu diimpor di sini.
require('@testing-library/react-native');

// Mock AsyncStorage: implementasi resmi bergantung pada native module yang
// tidak tersedia di lingkungan test Node/jsdom milik jest-expo.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
