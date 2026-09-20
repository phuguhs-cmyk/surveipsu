/**
 * Util bersama untuk avatar inisial surveyor (warna & huruf), dipakai di
 * PackageListScreen dan AdminDashboardScreen agar tampilan konsisten dan
 * tidak terduplikasi di masing-masing layar.
 *
 * Warna dipilih deterministik berdasarkan nama (bukan acak) supaya
 * surveyor yang sama SELALU tampil dengan warna yang sama di seluruh layar.
 */

const AVATAR_PALETTE = ['#3b6fd6', '#3fa876', '#dba13a', '#e0685f', '#8b5cf6', '#0891b2', '#c2410c', '#4f46e5'];

export function getAvatarColor(name: string): string {
  const trimmed = (name || '?').trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

export function getAvatarInitial(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}
