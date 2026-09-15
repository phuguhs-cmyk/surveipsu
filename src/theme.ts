/**
 * Tema tampilan terpusat untuk seluruh aplikasi.
 *
 * Tujuan: membuat UI terasa lebih "soft"/lembut ketimbang gaya sebelumnya
 * yang cenderung tajam (warna terlalu jenuh, sudut kotak, font terlalu tebal).
 * Semua layar sebaiknya mengambil warna/ukuran dari objek `theme` ini alih-alih
 * menulis ulang kode warna hex secara langsung, supaya konsisten dan mudah
 * diubah dari satu tempat di masa depan.
 *
 * Prinsip:
 * - Warna aksen (biru) sedikit lebih lembut & tidak terlalu saturated
 *   dibanding biru "electric" `#2563eb` bawaan, tapi tetap cukup kontras
 *   untuk aksesibilitas teks putih di atasnya.
 * - Warna teks utama bukan hitam pekat (`#0f172a`) melainkan abu gelap yang
 *   lebih lembut, dan warna teks sekunder abu-abu medium yang nyaman dibaca.
 * - Radius disusun bertingkat (scale) supaya proporsional: elemen kecil
 *   (chip/badge/tombol kecil) pakai radius kecil, kartu/panel besar pakai
 *   radius besar, dan elemen pil/bulat penuh pakai radius sangat besar.
 * - Font weight dikurangi satu tingkat dari kebiasaan lama (700/bold -> 600,
 *   600 -> 500) supaya teks terasa lebih ringan/lembut, tetap terbaca jelas.
 */

export const theme = {
  colors: {
    // Aksen utama (dulu #2563eb) - biru yang sedikit lebih lembut/soft.
    primary: '#3b6fd6',
    primaryDark: '#2f5bc0',
    primaryLight: '#eef3fc',
    primarySoftBg: '#eef3fc',
    primaryBorder: '#c9dcf7',

    // Status
    success: '#3fa876',
    successBg: '#eaf7f1',
    warning: '#dba13a',
    warningBg: '#fdf3e2',
    danger: '#e0685f',
    dangerBg: '#fbeae9',

    // Netral / teks
    textPrimary: '#33415c',
    textSecondary: '#6b7a94',
    textMuted: '#98a3b8',
    textOnPrimary: '#ffffff',

    // Latar & garis
    background: '#f7f9fc',
    surface: '#ffffff',
    border: '#e2e8f2',
    borderSoft: '#eceff5',
    disabled: '#c7d3e6',
  },

  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },

  font: {
    // Pengganti proporsional untuk fontWeight yang dulu dipakai:
    // 'bold'/'700' -> semiBold, '600' -> medium, '500' -> regularPlus.
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },
};

export type AppTheme = typeof theme;
export default theme;
