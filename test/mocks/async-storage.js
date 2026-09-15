// Manual mock ringan untuk '@react-native-async-storage/async-storage',
// dipakai pada unit test Node (authService/apiService) tanpa perlu native
// module sungguhan. Implementasi in-memory sederhana yang meniru API yang
// benar-benar dipakai oleh kode aplikasi (get/set/remove/multiSet/multiRemove).
let store = {};

module.exports = {
  __esModule: true,
  default: {
    getItem: jest.fn(async (key) => (key in store ? store[key] : null)),
    setItem: jest.fn(async (key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn(async (key) => {
      delete store[key];
    }),
    multiSet: jest.fn(async (pairs) => {
      pairs.forEach(([key, value]) => {
        store[key] = value;
      });
    }),
    multiRemove: jest.fn(async (keys) => {
      keys.forEach((key) => {
        delete store[key];
      });
    }),
    multiGet: jest.fn(async (keys) => keys.map((key) => [key, key in store ? store[key] : null])),
    clear: jest.fn(async () => {
      store = {};
    }),
    __reset: () => {
      store = {};
    },
  },
};
