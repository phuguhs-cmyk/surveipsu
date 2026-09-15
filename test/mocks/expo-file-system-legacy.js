// Manual mock untuk 'expo-file-system/legacy', dipakai oleh offlineMapService
// (diimpor di top-level walau hanya benar-benar dipakai di fungsi unduh tile
// yang tidak dites di unit test ini).
module.exports = {
  __esModule: true,
  cacheDirectory: '/mock-cache/',
  documentDirectory: '/mock-documents/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: jest.fn(async () => ({ exists: false, size: 0 })),
  makeDirectoryAsync: jest.fn(async () => {}),
  downloadAsync: jest.fn(async () => ({ status: 200, uri: '' })),
  writeAsStringAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  deleteAsync: jest.fn(async () => {}),
};
