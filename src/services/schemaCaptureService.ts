import { Platform } from 'react-native';
import { SurveyPhoto } from '../types';

/**
 * Mengubah komponen skema react-native-svg (via ref) menjadi SurveyPhoto
 * (base64 JPEG/PNG) agar bisa langsung masuk ke alur foto yang sudah ada
 * (photos[], queueService, upload ke Drive), sama seperti foto kamera biasa.
 *
 * - Native (Android/iOS): react-native-svg menyediakan method `toDataURL`
 *   pada ref komponen <Svg>, mengembalikan base64 PNG langsung dari native.
 * - Web: react-native-svg-web me-render elemen <svg> DOM asli. Di web kita
 *   serialize elemen tsb ke string XML, gambar ke <canvas> lewat <img>,
 *   lalu ambil data URL JPEG dari canvas (sama seperti alur resize foto
 *   kamera web yang sudah ada di photoService.ts).
 */
export async function captureSchemaAsPhoto(svgRef: any, fileName: string): Promise<SurveyPhoto | null> {
  if (Platform.OS === 'web') {
    return captureSchemaWeb(svgRef, fileName);
  }
  return captureSchemaNative(svgRef, fileName);
}

function captureSchemaNative(svgRef: any, fileName: string): Promise<SurveyPhoto | null> {
  return new Promise((resolve) => {
    try {
      const node = svgRef?.current;
      if (!node || typeof node.toDataURL !== 'function') {
        resolve(null);
        return;
      }
      node.toDataURL((base64: string) => {
        if (!base64) {
          resolve(null);
          return;
        }
        resolve({
          uri: `data:image/png;base64,${base64}`,
          base64,
          mimeType: 'image/png',
          fileName,
        });
      });
    } catch {
      resolve(null);
    }
  });
}

function findSvgDomNode(ref: any): SVGSVGElement | null {
  const node = ref?.current;
  if (!node) return null;
  // Pada react-native-svg-web, ref bisa merujuk langsung ke elemen <svg>
  // atau ke wrapper yang berisi <svg> sebagai anak.
  if (node.tagName && node.tagName.toLowerCase() === 'svg') return node as SVGSVGElement;
  if (typeof node.querySelector === 'function') {
    const found = node.querySelector('svg');
    if (found) return found as SVGSVGElement;
  }
  if (node._touchableNode) return node._touchableNode;
  if (typeof document !== 'undefined') {
    const fallback = document.querySelector('#longitudinal-profile-capture');
    if (fallback && fallback.tagName.toLowerCase() === 'svg') return fallback as SVGSVGElement;
  }
  return null;
}

function loadSvgImage(svgString: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl = '';
    let settled = false;
    let triedDataUrl = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      callback();
    };
    const timer = window.setTimeout(() => finish(() => reject(new Error('SVG terlalu lama diproses'))), 5000);
    img.onload = () => {
      window.clearTimeout(timer);
      finish(() => resolve(img));
    };
    img.onerror = () => {
      if (!triedDataUrl) {
        triedDataUrl = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = '';
        }
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        return;
      }
      window.clearTimeout(timer);
      finish(() => reject(new Error('Browser gagal membaca SVG')));
    };

    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
    } catch {
      // Fallback untuk browser yang tidak mendukung Blob URL.
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
    }
  });
}

function captureSchemaWeb(svgRef: any, fileName: string): Promise<SurveyPhoto | null> {
  return new Promise((resolve) => {
    try {
      const svgNode = findSvgDomNode(svgRef);
      if (!svgNode) {
        resolve(null);
        return;
      }
      const width = Number(svgNode.getAttribute('width')) || 320;
      const height = Number(svgNode.getAttribute('height')) || 220;
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgNode);
      if (!svgString.includes('xmlns=')) {
        svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!svgString.includes('xmlns:xlink=')) {
        svgString = svgString.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      if (!svgString.includes('viewBox=') && width > 0 && height > 0) {
        svgString = svgString.replace('<svg ', `<svg viewBox="0 0 ${width} ${height}" `);
      }

      loadSvgImage(svgString).then((img) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64 = dataUrl.split(',')[1];
        resolve({
          uri: dataUrl,
          base64,
          mimeType: 'image/jpeg',
          fileName,
        });
      }).catch(() => resolve(null));
    } catch {
      resolve(null);
    }
  });
}
