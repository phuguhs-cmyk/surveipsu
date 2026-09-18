import { Platform } from 'react-native';

/** Dokumen yang dipilih pengguna untuk diunggah (mis. proposal/RAB PDF). */
export interface PickedDocument {
  uri: string;
  base64: string;
  mimeType: string;
  fileName: string;
}

// Batas ukuran file proposal (5 MB) agar tidak membebani Google Apps Script
// (batas payload request GAS Web App terbatas & base64 menambah ~33% ukuran).
const MAX_PROPOSAL_SIZE_BYTES = 5 * 1024 * 1024;

function pickDocumentWeb(): Promise<PickedDocument | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      if (file.size > MAX_PROPOSAL_SIZE_BYTES) {
        reject(new Error('Ukuran file maksimal 5 MB.'));
        return;
      }
      try {
        const dataUrl: string = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = () => rej(new Error('Gagal membaca file.'));
          reader.readAsDataURL(file);
        });
        const base64 = dataUrl.split(',')[1] || '';
        resolve({
          uri: dataUrl,
          base64,
          mimeType: file.type || 'application/pdf',
          fileName: file.name || `proposal_${Date.now()}.pdf`,
        });
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function pickDocumentNative(): Promise<PickedDocument | null> {
  const DocumentPicker = await import('expo-document-picker');
  const FileSystem = await import('expo-file-system/legacy');

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];

  if (asset.size != null && asset.size > MAX_PROPOSAL_SIZE_BYTES) {
    throw new Error('Ukuran file maksimal 5 MB.');
  }

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    uri: asset.uri,
    base64,
    mimeType: asset.mimeType || 'application/pdf',
    fileName: asset.name || `proposal_${Date.now()}.pdf`,
  };
}

/** Membuka file picker untuk memilih dokumen proposal (PDF/DOC/DOCX). */
export async function pickProposalDocument(): Promise<PickedDocument | null> {
  if (Platform.OS === 'web') {
    return pickDocumentWeb();
  }
  return pickDocumentNative();
}
