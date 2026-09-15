// Manual mock ringan untuk modul 'react-native' dipakai pada unit test Node
// (bukan test render komponen). Hanya menyediakan bagian yang benar-benar
// dipakai oleh kode non-UI (services/utils), karena modul asli 'react-native'
// berisi source Flow/JSX yang tidak bisa langsung di-require di lingkungan
// Node biasa tanpa transformer khusus (mis. jest-expo/babel-jest).
module.exports = {
  Platform: {
    OS: 'android',
    select: (obj) => obj.android ?? obj.default,
  },
};
