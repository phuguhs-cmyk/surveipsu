import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import expoConfig from 'eslint-config-expo/flat.js';
import globals from 'globals';

/**
 * Konfigurasi ESLint (flat config, format baru ESLint v9+) untuk project ini.
 * Dasarnya memakai `eslint-config-expo` (config resmi Expo, sudah mencakup
 * aturan React/React Native/import yang relevan untuk SDK 57), ditambah
 * aturan dasar JS & TypeScript. File yang dihasilkan (assets/, dist/,
 * node_modules/, dsb.) diabaikan karena bukan kode yang ditulis manual.
 */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.expo/**',
      'android/**',
      'ios/**',
      'assets/**',
      'map-data/**',
      'src/assets/**',
      'public/**',
      'coverage/**',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...expoConfig,
  {
    rules: {
      // Proyek ini masih memakai banyak `any` yang disengaja di boundary
      // API/JSON (respons Google Apps Script tidak diketik ketat). Menjadikan
      // ini "error" akan menghasilkan ratusan false-positive tanpa manfaat;
      // cukup diturunkan ke warning agar tetap terlihat tapi tidak
      // memblokir `npm run lint`/CI.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Sesuai konfigurasi tsconfig proyek ini, JSX `<canvas>` di
      // SketchCanvasModal.tsx TIDAK menghasilkan error tsc (tipe JSX react-
      // native-web sudah cukup longgar), sehingga `@ts-expect-error` di
      // sana justru gagal (TS2578: unused directive) sedangkan
      // `@ts-ignore` aman/tidak berefek. Aturan lint yang memaksa
      // `@ts-expect-error` dimatikan khusus untuk kasus ini.
      '@typescript-eslint/ban-ts-comment': ['warn', { 'ts-ignore': 'allow-with-description' }],
      // Kutip ganda di dalam teks JSX (mis. label berisi tanda kutip) murni
      // kosmetik/tidak berdampak fungsional; diturunkan ke warning alih-alih
      // memaksa escape HTML entity di puluhan tempat pada kode yang sudah
      // berjalan baik di produksi.
      'react/no-unescaped-entities': 'warn',
      // Aturan react-hooks/* di bawah berasal dari plugin React Compiler
      // (eslint-plugin-react-hooks versi baru) yang sangat ketat dan masih
      // menghasilkan banyak false-positive pada pola React biasa (mis.
      // sinkronisasi state dari props via useEffect, akses ref di event
      // handler yang dipanggil saat render pertama). Diturunkan ke warning
      // supaya tetap terlihat sebagai sinyal untuk ditinjau/direfactor
      // bertahap, tanpa memblokir CI pada kode yang sudah teruji jalan.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      // Sama halnya: pesan error asli dari `catch` biasanya sudah disertakan
      // ke pesan Error baru yang dilempar ulang (lihat pola
      // `throw new Error('...: ' + err.message)` di service layer), jadi
      // tidak menghilangkan konteks meskipun tidak memakai `{ cause }`.
      'preserve-caught-error': 'warn',
    },
  },
  {
    // Script build/tooling Node.js CommonJS (dijalankan lewat `node scripts/...`,
    // bukan lewat bundler Metro), jadi wajar memakai `require()` dan global Node
    // (process, __dirname, dst.) alih-alih ES module.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // File test (Jest) & mock manual test/*: memakai global bawaan Jest
    // (jest, describe, it, expect, dst.) dan lazim memakai `require()` CommonJS
    // (module.exports) untuk mock, bukan ES module. Tanpa override ini,
    // eslint-config-expo (yang tidak tahu tentang lingkungan Jest) menganggap
    // `jest` sebagai variabel tak terdefinisi (no-undef) dan `require()`
    // dilarang (no-require-imports), padahal keduanya valid & disengaja di
    // konteks test.
    files: [
      'test/**/*.{js,ts,tsx}',
      '**/__tests__/**/*.{js,ts,tsx}',
      '**/*.test.{js,ts,tsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
