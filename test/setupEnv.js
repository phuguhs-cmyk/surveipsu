// Diset lewat jest.config.js `setupFiles`, dijalankan SEBELUM modul test
// di-import (termasuk sebelum import 'react-native' hoisting ES module
// dievaluasi), sehingga src/config.ts membaca nilai ini saat pertama kali
// di-require oleh authService/apiService.
process.env.GAS_WEB_APP_URL = 'https://example.com/exec';
