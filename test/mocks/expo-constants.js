// Manual mock untuk 'expo-constants' pada unit test Node murni. Nilai
// `extra` dikosongkan secara default (test yang butuh nilai spesifik bisa
// meng-override via `Constants.expoConfig.extra` langsung di dalam test).
module.exports = {
  __esModule: true,
  default: {
    expoConfig: { extra: {} },
  },
};
