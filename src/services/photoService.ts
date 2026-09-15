import { Platform } from 'react-native';
import { SurveyPhoto } from '../types';

// ─── Web fallback ─────────────────────────────────────────────────────────────

/**
 * Implementasi bersama untuk mengambil satu foto di web lewat file picker
 * native browser (input[type=file]), lalu me-resize hasilnya via Canvas.
 * Dipakai baik oleh alur kamera (`useCameraCapture=true`, membuka kamera
 * belakang di mobile browser) maupun alur galeri (`useCameraCapture=false`,
 * membuka file explorer/galeri perangkat), yang sebelumnya diduplikasi
 * sebagai dua fungsi terpisah dengan logic identik.
 */
function pickImageWeb(useCameraCapture: boolean): Promise<SurveyPhoto | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (useCameraCapture) {
      // capture="environment" membuka kamera belakang di mobile browser
      input.setAttribute('capture', 'environment');
    }

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      try {
        const dataUrl = await resizeImageWeb(file, 1080, 0.7);
        const base64 = dataUrl.split(',')[1];
        resolve({
          uri: dataUrl,
          base64,
          mimeType: 'image/jpeg',
          fileName: file.name || `foto_${Date.now()}.jpg`,
        });
      } catch {
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

function resizeImageWeb(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas tidak tersedia')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Gagal memuat gambar')); };
    img.src = objectUrl;
  });
}

// ─── Native (Android/iOS) ─────────────────────────────────────────────────────

const NATIVE_PHOTO_MAX_EDGE = 1200;
const NATIVE_PHOTO_QUALITY = 0.6;

async function manipulateAndReadNative(uri: string, fileName?: string): Promise<SurveyPhoto> {
  const FileSystem = await import('expo-file-system/legacy');
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

  const safeSourceUri = uri || '';
  if (!safeSourceUri) {
    throw new Error('Gambar yang dipilih tidak valid.');
  }

  let finalUri = safeSourceUri;
  try {
    const manipulated = await manipulateAsync(
      safeSourceUri,
      [{ resize: { width: NATIVE_PHOTO_MAX_EDGE } }],
      { compress: NATIVE_PHOTO_QUALITY, format: SaveFormat.JPEG }
    );
    finalUri = manipulated.uri;
  } catch {
    // Fallback aman: tetap gunakan file asli bila resize/manipulasi gagal.
    // Ini mencegah crash saat gambar besar atau format tidak didukung.
  }

  const base64 = await FileSystem.readAsStringAsync(finalUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: finalUri,
    base64,
    mimeType: 'image/jpeg',
    fileName: fileName || `foto_${Date.now()}.jpg`,
  };
}

/**
 * Implementasi bersama untuk mengambil satu foto di native (Android/iOS)
 * lewat expo-image-picker, baik dari kamera (`fromCamera=true`) maupun dari
 * galeri/media library (`fromCamera=false`), yang sebelumnya diduplikasi
 * sebagai dua fungsi terpisah dengan logic identik (hanya beda permission &
 * method launcher yang dipanggil).
 */
async function pickImageNative(fromCamera: boolean): Promise<SurveyPhoto | null> {
  const ImagePicker = await import('expo-image-picker');

  const { status } = fromCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error(
      fromCamera
        ? 'Izin akses kamera ditolak. Aktifkan izin kamera untuk mengambil foto survei.'
        : 'Izin akses galeri ditolak. Aktifkan izin galeri/media untuk memilih foto.'
    );
  }

  const pickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: false };
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync(pickerOptions as any)
    : await ImagePicker.launchImageLibraryAsync(pickerOptions as any);

  if (result.canceled || !result.assets || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return manipulateAndReadNative(asset.uri, asset.fileName || undefined);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function takePhoto(): Promise<SurveyPhoto | null> {
  if (Platform.OS === 'web') {
    return pickImageWeb(true);
  }
  return pickImageNative(true);
}

/** Ambil foto dari galeri/album perangkat (bukan kamera). */
export async function pickPhotoFromGallery(): Promise<SurveyPhoto | null> {
  if (Platform.OS === 'web') {
    return pickImageWeb(false);
  }
  return pickImageNative(false);
}
