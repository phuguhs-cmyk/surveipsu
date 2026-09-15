import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { buildPickerMapHtml } from '../services/leafletHtml';
import { CONFIG } from '../config';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  /** Titik awal (jika sudah pernah diisi sebelumnya) untuk ditampilkan saat
   * peta pertama dibuka. */
  initialLatitude?: number;
  initialLongitude?: number;
  onClose: () => void;
  onConfirm: (lat: number, lng: number) => void;
  /**
   * ID paket pekerjaan terkait. Tidak lagi memengaruhi sumber tile (peta
   * selalu memuat tile ONLINE langsung dari internet), tetap diterima agar
   * kompatibel dengan pemanggil yang sudah ada.
   */
  packageId?: string;
}

// Titik tengah default (Kabupaten Banjarnegara) dipakai saat belum ada
// koordinat awal sama sekali, supaya peta tidak terbuka di lautan/kosong.
const DEFAULT_CENTER = { lat: -7.3906, lng: 109.6947 };
const DEFAULT_ZOOM = 13;
const PICKED_ZOOM = 16;

/**
 * Modal peta untuk menentukan/menyesuaikan satu titik koordinat dengan cara
 * mengetuk peta atau menggeser penanda (marker). Peta selalu memuat ubin
 * (tile) ONLINE langsung dari internet (dibutuhkan koneksi internet aktif).
 * Di web, WebView tidak didukung sehingga dipakai `<iframe srcDoc>` sebagai
 * gantinya (sama seperti pola di `PackageMapScreen`); pesan titik yang
 * dipilih diterima lewat `window.addEventListener('message', ...)` di web,
 * atau `onMessage` WebView di native.
 */
export default function CoordinatePickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  onClose,
  onConfirm,
  packageId,
}: Props) {
  const hasInitial = Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    hasInitial ? { lat: initialLatitude as number, lng: initialLongitude as number } : null
  );
  // Dipakai sebagai `key` WebView/iframe agar dipaksa REMOUNT (dibuat ulang
  // dari nol) setiap kali modal ini dibuka. TANPA ini, karena `Modal` React
  // Native hanya menyembunyikan/menampilkan native window sementara children
  // (termasuk WebView) tetap sama & tidak pernah di-unmount, WebView yang
  // sudah dibuat sebelumnya (mis. saat modal pertama kali dibuka lalu
  // ditutup) dipakai LAGI saat modal dibuka kembali dengan status render
  // internalnya yang mungkin belum sepenuhnya utuh/ter-ukur ulang oleh
  // Android — menyebabkan peta tampak terpotong meski `androidLayerType`
  // sudah diset. Meremount WebView setiap kali modal dibuka memaksa Android
  // membuat & mengukur ulang native view dari awal, sehingga tile Leaflet
  // selalu ter-render utuh.
  const [mapRenderKey, setMapRenderKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setPoint(hasInitial ? { lat: initialLatitude as number, lng: initialLongitude as number } : null);
    setMapRenderKey((prev) => prev + 1);
  }, [visible, hasInitial, initialLatitude, initialLongitude]);

  const html = useMemo(() => {
    if (!visible) return '';
    return buildPickerMapHtml({
      centerLat: hasInitial ? (initialLatitude as number) : DEFAULT_CENTER.lat,
      centerLng: hasInitial ? (initialLongitude as number) : DEFAULT_CENTER.lng,
      zoom: hasInitial ? PICKED_ZOOM : DEFAULT_ZOOM,
      mapMode: 'hybrid',
      onlineTileUrlTemplate: CONFIG.OFFLINE_MAP_TILE_URL_TEMPLATE,
      onlineVectorStyleUrl: undefined,
      minOnlineZoom: CONFIG.ONLINE_MAP_MIN_ZOOM,
      maxOnlineZoom: CONFIG.ONLINE_MAP_MAX_ZOOM,
      initialPoint: hasInitial ? { lat: initialLatitude as number, lng: initialLongitude as number } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);


  const handlePoint = (lat: number, lng: number) => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPoint({ lat, lng });
    }
  };

  const handleWebViewMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'picker_point') handlePoint(msg.lat, msg.lng);
    } catch {}
  };

  // Di web, iframe srcDoc mengirim pesan lewat window.postMessage biasa
  // (bukan onMessage WebView), jadi kita dengarkan lewat event listener.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const listener = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg?.type === 'picker_point') handlePoint(msg.lat, msg.lng);
      } catch {}
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Pilih Koordinat di Peta</Text>
          <Text style={styles.subtitle}>
            {point
              ? `Lat: ${point.lat.toFixed(6)}, Lng: ${point.lng.toFixed(6)}`
              : 'Ketuk peta untuk menentukan titik lokasi.'}
          </Text>
          <Text style={styles.modeHint}>🌐 Peta online (membutuhkan koneksi internet).</Text>
        </View>

        <View style={styles.mapCard}>
          {html ? (
            Platform.OS === 'web'
              ? React.createElement('iframe', {
                  key: mapRenderKey,
                  srcDoc: html,
                  style: { flex: 1, width: '100%', height: '100%', border: 'none', borderRadius: 12 },
                })
              : (
                <WebView
                  key={mapRenderKey}
                  originWhitelist={['*']}
                  source={{ html }}
                  style={styles.webview}
                  onMessage={handleWebViewMessage}
                  javaScriptEnabled
                  domStorageEnabled
                  nestedScrollEnabled
                  scalesPageToFit={false}
                  // PENTING: mapCard membungkus WebView dengan
                  // overflow:'hidden' + borderRadius. Di Android, itu
                  // memaksa WebView di-composite sebagai hardware texture
                  // terpisah yang di-clip, dan sering menyebabkan tile peta
                  // Leaflet hanya SEBAGIAN ter-render (tampak terpotong
                  // menjadi kotak-kotak, ada area kosong di antaranya)
                  // sampai pengguna berinteraksi ulang. Memaksa WebView
                  // memakai rendering software menghindari bug compositing
                  // ini sehingga seluruh peta ter-render utuh.
                  androidLayerType="software"
                />
              )
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
            <Text style={styles.buttonSecondaryText}>Batal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, !point && styles.buttonDisabled]}
            disabled={!point}
            onPress={() => point && onConfirm(point.lat, point.lng)}
          >
            <Text style={styles.buttonPrimaryText}>Gunakan Titik Ini</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
  },
  header: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: theme.font.semiBold, color: theme.colors.textPrimary },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  modeHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapCard: {
    flex: 1,
    minHeight: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 0,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.md,
    backgroundColor: '#dfe7f0',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  button: {
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 110,
    alignItems: 'center',
  },
  buttonSecondary: { backgroundColor: theme.colors.border },
  buttonSecondaryText: { color: theme.colors.textPrimary, fontWeight: theme.font.semiBold, fontSize: 14 },
  buttonPrimary: { backgroundColor: theme.colors.primary },
  buttonDisabled: { backgroundColor: theme.colors.disabled },
  buttonPrimaryText: { color: theme.colors.textOnPrimary, fontWeight: theme.font.semiBold, fontSize: 14 },
});

