import { Platform } from 'react-native';

export interface CurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

// ─── Web fallback ─────────────────────────────────────────────────────────────

function getCurrentLocationWeb(): Promise<CurrentLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Browser ini tidak mendukung GPS/Geolocation.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Izin akses lokasi ditolak. Aktifkan izin lokasi di browser.'));
        } else {
          reject(new Error('Gagal mendapatkan lokasi: ' + err.message));
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

// ─── Native (Android/iOS) ─────────────────────────────────────────────────────

async function getCurrentLocationNative(): Promise<CurrentLocation> {
  const Location = await import('expo-location');
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Izin akses lokasi ditolak. Aktifkan izin lokasi untuk melanjutkan survei.');
  }

  // GPS akurasi tinggi (High) bisa memakan waktu lama atau menggantung di
  // area dengan sinyal satelit lemah (dalam ruangan, gedung tinggi, dsb).
  // Beri batas waktu eksplisit dan, jika terlampaui, coba lagi dengan
  // akurasi lebih rendah (Balanced) yang jauh lebih cepat didapat (memakai
  // triangulasi jaringan/WiFi selain GPS murni), lebih baik daripada
  // pengguna menunggu tanpa batas atau gagal total.
  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT_LOCATION')), ms);
      promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });

  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      12000
    );
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  } catch (err: any) {
    if (err?.message !== 'TIMEOUT_LOCATION') throw err;
    // Fallback: akurasi lebih rendah agar tetap cepat mendapat lokasi.
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    };
  }
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function getCurrentLocation(): Promise<CurrentLocation> {
  if (Platform.OS === 'web') {
    return getCurrentLocationWeb();
  }
  return getCurrentLocationNative();
}
