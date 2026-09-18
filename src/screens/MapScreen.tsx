import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { Alert } from '../utils/alert';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { getOfflinePmtilesLocalUri } from '../services/pmtilesAsset';

import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { getPackageById, getPackages, buildPackageMapMarkers } from '../services/packageService';
import { fetchSurveyList, publicFetchSurveyList } from '../services/apiService';
import { getQueue } from '../services/queueService';
import { CONFIG } from '../config';
import { buildMapHtml, LeafletMarker, LeafletAnnotation } from '../services/leafletHtml';
import { parseCoordinate } from '../services/commonUtils';
import { theme } from '../theme';
import { getCurrentUser } from '../services/authService';
import {
  getPackageAnnotations,
  addPackageAnnotation,
  removePackageAnnotation,
  syncPackageAnnotationsFromServer,
  syncPackageAnnotationsFromPublicServer,
  updatePackageAnnotationLabel,
  pickPreferredSegmentLocationLabel,
  getLocationLabelChoices,
  MapAnnotation,
} from '../services/annotationService';


type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

function makeId() {
  const globalCrypto = globalThis as any;
  if (globalCrypto?.crypto && typeof globalCrypto.crypto.randomUUID === 'function') {
    return globalCrypto.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface SurveyedLocation {
  lat: number;
  lng: number;
  infrastructureType: string;
  locationNote: string;
  packageId?: string;
  packageName?: string;
  status?: 'draft' | 'in_progress' | 'posted';
}

const OVERLAY_MARKER_COLORS: Record<string, string> = {
  Jalan: '#ef4444',
  'Drainase/Saluran Air': '#0ea5e9',
  'Dinding Penahan Tanah (DPT)': '#f59e0b',
  'Gorong-gorong': '#a855f7',
  Jembatan: '#16a34a',
  'Paket Pekerjaan': '#1d4ed8',
  'Titik Pusat Paket': '#1d4ed8',
};

const PACKAGE_STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  in_progress: '#2563eb',
  posted: '#16a34a',
};

function markerColorFor(infrastructureType: string): string {
  return OVERLAY_MARKER_COLORS[infrastructureType] || '#ef4444';
}

function markerColorForPackageStatus(status?: string): string {
  return PACKAGE_STATUS_COLORS[status || 'draft'] || '#94a3b8';
}

// Titik tengah & zoom overview Kabupaten Banjarnegara, dipakai saat
// menampilkan peta "semua paket" (tanpa packageId) sebelum ada titik apa pun.
const BANJARNEGARA_CENTER = { lat: -7.3906, lng: 109.6947 };
const BANJARNEGARA_ZOOM = 8;

function getSuggestedAnnotationLabel(
  points: { lat: number; lng: number }[],
  surveyedLocations: SurveyedLocation[],
  fallbackLabel?: string
): string | undefined {
  if (!points.length) {
    const fallback = String(fallbackLabel ?? '').trim();
    return fallback.length > 0 && fallback !== 'undefined' ? fallback : undefined;
  }

  const centroid = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 }
  );
  const center = {
    lat: centroid.lat / points.length,
    lng: centroid.lng / points.length,
  };

  const candidateLabels = points
    .map((point) => {
      const nearest = surveyedLocations.reduce<{ label: string; distance: number } | null>((best, location) => {
        const distance = Math.hypot(point.lat - location.lat, point.lng - location.lng);
        if (!best || distance < best.distance) {
          return { label: location.locationNote || '', distance };
        }
        return best;
      }, null);
      return nearest?.label?.trim() || '';
    })
    .filter(Boolean);

  const packageLabelCounts = new Map<string, number>();
  surveyedLocations.forEach((location) => {
    const label = String(location.locationNote ?? '').trim();
    if (!label || label === 'undefined') return;
    packageLabelCounts.set(label, (packageLabelCounts.get(label) ?? 0) + 1);
  });

  const bestPackageLabel = Array.from(packageLabelCounts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aDistance = surveyedLocations.reduce((min, location) => {
        const itemLabel = String(location.locationNote ?? '').trim();
        if (itemLabel !== a[0]) return min;
        return Math.min(min, Math.hypot(center.lat - location.lat, center.lng - location.lng));
      }, Number.POSITIVE_INFINITY);
      const bDistance = surveyedLocations.reduce((min, location) => {
        const itemLabel = String(location.locationNote ?? '').trim();
        if (itemLabel !== b[0]) return min;
        return Math.min(min, Math.hypot(center.lat - location.lat, center.lng - location.lng));
      }, Number.POSITIVE_INFINITY);
      return aDistance - bDistance;
    })[0]?.[0];

  const preferred = pickPreferredSegmentLocationLabel(
    [...candidateLabels, ...(bestPackageLabel ? [bestPackageLabel] : [])],
    fallbackLabel
  );

  return preferred ?? (fallbackLabel ? String(fallbackLabel).trim() || undefined : undefined);
}

/**
 * Layar peta gabungan (menggantikan OfflineMapScreen & PackageMapScreen yang
 * sebelumnya terpisah dan tumpang tindih):
 * - Dibuka DENGAN packageId: menampilkan titik lokasi survei satu paket,
 *   dengan tombol "Mode Anotasi" opsional untuk menggambar garis/polygon
 *   (mis. menandai rute/area) yang disimpan per paket.
 * - Dibuka TANPA packageId (mis. dari tombol "Lihat Peta" di daftar paket):
 *   menampilkan titik pusat SEMUA paket sekaligus, tanpa mode anotasi.
 * Peta selalu memuat ubin (tile) ONLINE langsung dari internet (perlu
 * koneksi aktif). Di web, react-native-webview tidak didukung sehingga
 * dipakai `<iframe srcDoc>` sebagai gantinya.
 */
export default function MapScreen({ route }: Props) {
  const { packageId, packageName } = route.params || {};
  const isAllPackages = !packageId;

  const [loading, setLoading] = useState(true);
  const [surveyedLocations, setSurveyedLocations] = useState<SurveyedLocation[]>([]);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [mapHtmlUri, setMapHtmlUri] = useState<string | null>(null);
  const [mapHtmlContent, setMapHtmlContent] = useState<string | null>(null);
  const [webviewKey, setWebviewKey] = useState(0);
  const webviewRef = useRef<WebView | null>(null);
  const loadInFlightRef = useRef(false);

  // Mode anotasi (gambar garis/polygon) hanya tersedia untuk peta SATU
  // paket; peta "semua paket" selalu read-only.
  const [annotateMode, setAnnotateMode] = useState(false);
  // Panel "Fitur peta" (legend) disembunyikan secara default agar tampilan
  // peta memenuhi layar penuh (mirip layar kamera), bisa dibuka lewat
  // tombol "?" bila pengguna butuh bantuan.
  const [legendVisible, setLegendVisible] = useState(false);
  const canAnnotate = !isAllPackages;

  const [labelModalVisible, setLabelModalVisible] = useState(false);
  const [labelInputValue, setLabelInputValue] = useState('');
  const [labelChoices, setLabelChoices] = useState<string[]>([]);
  const [pendingShape, setPendingShape] = useState<{ type: 'polyline' | 'polygon'; points: { lat: number; lng: number }[] } | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  // Daftar SEMUA "Alamat/Keterangan Lokasi" milik paket ini, TERLEPAS dari
  // apakah baris survei tersebut punya koordinat GPS valid atau tidak.
  // SENGAJA dipisah dari `surveyedLocations` (yang dipakai untuk menaruh
  // penanda/marker di peta dan MEMANG harus difilter agar hanya punya
  // koordinat valid) — karena pilihan label anotasi tidak butuh koordinat
  // sama sekali. Sebelumnya kedua kebutuhan ini memakai array yang sama,
  // sehingga survei yang disimpan TANPA GPS (mis. sinyal lemah/GPS
  // dimatikan) kehilangan alamat/keterangan lokasinya dari daftar pilihan
  // chip di modal label anotasi, padahal datanya sudah benar tersimpan.
  const [allLocationNotes, setAllLocationNotes] = useState<string[]>([]);
  // Akun Viewer (menu Data Publik) memakai jalur PUBLIK (tanpa sessionToken)
  // untuk memuat lokasi survei maupun anotasi peta, karena sesi login Viewer
  // mudah kedaluwarsa (layar-layar publik lain yang biasa dipakai Viewer
  // tidak pernah memvalidasi sesi) — jika jalur terautentikasi biasa
  // (fetchSurveyList/syncPackageAnnotationsFromServer) tetap dipakai, gagal
  // validasi sesi membuat peta tampil tanpa anotasi secara diam-diam.
  const [isViewer, setIsViewer] = useState(false);
  // Viewer HANYA boleh MELIHAT anotasi (garis/polygon + label) yang sudah
  // tersimpan, TIDAK boleh menambah anotasi baru maupun mengubah/menghapus
  // label anotasi yang ada — berbeda dari `canAnnotate` (yang hanya
  // membedakan peta satu paket vs peta semua paket, tanpa memandang role).
  const canEditAnnotations = canAnnotate && !isViewer;

  React.useEffect(() => {
    void getCurrentUser().then((user) => setIsViewer(user?.role === 'viewer'));
  }, []);


  const loadSurveyedLocations = useCallback(async (): Promise<SurveyedLocation[]> => {
    try {
      if (isAllPackages) {
        // Peta SEMUA paket: tampilkan titik pusat tiap paket (bukan titik
        // survei individual), sama seperti perilaku PackageMapScreen lama.
        const allPackages = await getPackages();

        // PENTING: field itemCount/posted pada daftar paket lokal (AsyncStorage)
        // TIDAK selalu diperbarui — layar lain (mis. PackageListScreen) hanya
        // menghitung status ini di memori dari data survei server tanpa
        // menuliskannya kembali ke penyimpanan lokal. Akibatnya peta "semua
        // paket" bisa menampilkan status yang sudah usang/tidak sesuai data
        // survei terbaru (mis. tetap "Belum Ada Data" walau sudah disurvei,
        // atau tidak langsung berubah saat admin posting/unpost). Untuk itu,
        // ambil juga data survei terbaru dari server (dengan cache pendek di
        // fetchSurveyList) dan hitung ulang status tiap paket dari sana,
        // sama seperti logika di PackageListScreen.
        const rows = isViewer
          ? await publicFetchSurveyList().catch(() => [])
          : await fetchSurveyList().catch(() => []);

        const statusByPackage = new Map<string, { count: number; posted: boolean }>();
        const seenItemKeys = new Set<string>();
        rows.forEach((row: any, index: number) => {
          const rowPackageId = row['ID Paket'];
          if (!rowPackageId) return;
          const isRowPosted = row['Status'] === 'Diposting';
          const itemKey = `${rowPackageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
          const isNewItem = !seenItemKeys.has(itemKey);
          if (isNewItem) seenItemKeys.add(itemKey);
          const existing = statusByPackage.get(rowPackageId);
          if (existing) {
            if (isNewItem) existing.count += 1;
            existing.posted = existing.posted && isRowPosted;
          } else {
            statusByPackage.set(rowPackageId, { count: 1, posted: isRowPosted });
          }
        });

        const packagesWithFreshStatus = allPackages.map((pkg) => {
          const fresh = statusByPackage.get(pkg.id);
          if (!fresh) return pkg;
          return { ...pkg, itemCount: fresh.count, posted: fresh.posted };
        });

        const markers = buildPackageMapMarkers({ packages: packagesWithFreshStatus });
        const locations: SurveyedLocation[] = markers.map((m) => ({
          lat: m.lat,
          lng: m.lng,
          infrastructureType: m.infrastructureType,
          locationNote: m.locationNote,
          packageId: m.packageId,
          packageName: m.packageName,
          status: m.status,
        }));
        setSurveyedLocations(locations);
        setLocationsError(locations.length === 0 ? 'Belum ada paket pekerjaan dengan koordinat pusat paket.' : null);
        return locations;
      }

      const rows = isViewer
        ? await publicFetchSurveyList(undefined, packageId).catch(() => [])
        : await fetchSurveyList(undefined, packageId).catch(() => []);

      // Gabungkan juga survei yang BELUM terkirim (masih di antrian offline)
      // supaya pilihan label (alamat/keterangan lokasi) tetap muncul walau
      // survei belum tersinkron ke server — sebelumnya jika semua survei di
      // paket ini masih berstatus "Belum Dikirim"/offline, `fetchSurveyList`
      // mengembalikan array kosong sehingga tidak ada satu pun lokasi yang
      // bisa dipilih di modal label anotasi.
      const queueRows = (await getQueue())
        .filter((item) => item.data?.packageId === packageId)
        .map((item) => ({
          Latitude: item.data?.latitude,
          Longitude: item.data?.longitude,
          'Tipe Infrastruktur': item.data?.infrastructureType || '-',
          'Alamat/Keterangan Lokasi': item.data?.locationNote || '',
        }));
      const combinedRows = [...rows, ...queueRows];
      // PENTING: kumpulkan alamat/keterangan lokasi dari SEMUA baris survei
      // paket ini (termasuk yang belum/tidak punya koordinat GPS valid),
      // agar tidak ada satu pun catatan lokasi yang hilang dari pilihan
      // label anotasi hanya karena baris tersebut tidak memiliki GPS.
      const locationNotes = combinedRows
        .map((row) => String(row['Alamat/Keterangan Lokasi'] || '').trim())
        .filter((note) => note.length > 0);
      setAllLocationNotes(locationNotes);

      const locations: SurveyedLocation[] = combinedRows
        .filter((row) => parseCoordinate(row['Latitude']) != null && parseCoordinate(row['Longitude']) != null)
        .map((row) => ({
          lat: parseCoordinate(row['Latitude'])!,
          lng: parseCoordinate(row['Longitude'])!,
          infrastructureType: row['Tipe Infrastruktur'] || '-',
          locationNote: row['Alamat/Keterangan Lokasi'] || '',
        }));


      setSurveyedLocations(locations);
      setLocationsError(locations.length === 0 ? 'Belum ada titik lokasi survei dengan koordinat GPS pada paket ini.' : null);
      return locations;
    } catch (error: any) {
      setLocationsError(error?.message || 'Gagal memuat lokasi hasil survei.');
      return [];
    }
  }, [packageId, isAllPackages, isViewer]);


  /** Membangun & menulis dokumen HTML peta (Leaflet, tile online) ke file
   * lokal, lalu memuatnya ke WebView lewat `source={{ uri }}` supaya ukuran
   * dokumen tidak melewati batas transaksi Binder IPC Android (~1MB). */
  const rebuildMapHtml = useCallback(
    async (
      locations: SurveyedLocation[],
      currentAnnotations: MapAnnotation[]
    ) => {
      let centerLat: number;
      let centerLng: number;
      let zoom: number;
      const points = locations.map((l) => ({ lat: l.lat, lng: l.lng }));

      if (isAllPackages) {
        if (points.length === 0) {
          centerLat = BANJARNEGARA_CENTER.lat;
          centerLng = BANJARNEGARA_CENTER.lng;
          zoom = BANJARNEGARA_ZOOM;
        } else {
          centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
          centerLng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
          zoom = CONFIG.ONLINE_MAP_MAX_ZOOM - 10;
        }
      } else {
        const pkg = await getPackageById(packageId!);
        const centerFromPoints = points.length
          ? points.reduce((acc, p) => ({ lat: acc.lat + p.lat / points.length, lng: acc.lng + p.lng / points.length }), { lat: 0, lng: 0 })
          : null;
        centerLat = Number.isFinite(pkg?.latitude) ? pkg!.latitude! : centerFromPoints?.lat ?? BANJARNEGARA_CENTER.lat;
        centerLng = Number.isFinite(pkg?.longitude) ? pkg!.longitude! : centerFromPoints?.lng ?? BANJARNEGARA_CENTER.lng;
        zoom = points.length ? 16 : 13;
      }

      const markers: LeafletMarker[] = locations.map((loc) => {
        if (isAllPackages) {
          const statusText = loc.status === 'posted' ? 'Survei Selesai' : loc.status === 'in_progress' ? 'Dalam Proses' : 'Belum Ada Data';
          return {
            lat: loc.lat,
            lng: loc.lng,
            color: loc.status ? markerColorForPackageStatus(loc.status) : markerColorFor(loc.infrastructureType),
            popupHtml: `<b>${loc.packageName || 'Paket Pekerjaan'}</b><br/>${statusText}`,
            packageName: loc.packageName,
            groupKey: loc.infrastructureType || 'Lainnya',
          };
        }
        return {
          lat: loc.lat,
          lng: loc.lng,
          color: markerColorFor(loc.infrastructureType),
          popupHtml: `<b>${loc.infrastructureType}</b><br/>${loc.locationNote || ''}`,
          label: loc.infrastructureType || undefined,
          groupKey: loc.infrastructureType || 'Lainnya',
        };
      });

      const leafletAnnotations: LeafletAnnotation[] = canAnnotate
        ? currentAnnotations.map((a) => ({ id: a.id, type: a.type, points: a.points, color: a.color, label: a.label }))
        : [];

      // Peta offline vector (PMTiles bawaan APK) hanya relevan di Android/
      // iOS (native, punya `file://`); di web tidak ada APK/aset native
      // sehingga diabaikan begitu saja (mode "Peta Offline" tidak tampil).
      let offlinePmtilesUri: string | undefined;
      if (Platform.OS !== 'web') {
        try {
          offlinePmtilesUri = await getOfflinePmtilesLocalUri();
        } catch (err: any) {
          console.warn('Gagal menyiapkan peta offline (PMTiles):', err?.message || err);
        }
      }

      const html = buildMapHtml({
        tileData: {},
        centerLat,
        centerLng,
        zoom,
        minZoom: CONFIG.ONLINE_MAP_MIN_ZOOM,
        maxZoom: CONFIG.ONLINE_MAP_MAX_ZOOM,
        // Saat mode gambar garis/polygon aktif, izinkan zoom EKSTRA (semu,
        // hasil upscale tile terakhir) supaya titik-titik anotasi lebih
        // mudah & presisi disentuh jari tanpa perlu tile tambahan.
        drawZoomOvershoot: canEditAnnotations && annotateMode ? 3 : 0,
        onlineTileUrlTemplate: CONFIG.ONLINE_MAP_MODES.street.tileUrlTemplate,
        // PENTING: di web, dokumen peta dimuat lewat `<iframe srcDoc>`
        // (bukan WebView native), yang di beberapa browser/lingkungan
        // sandbox membatasi WebGL/worker sehingga MapLibre GL (dipakai
        // untuk mode "Peta"/street vector) gagal total secara ASINKRON —
        // sebelumnya ini membuat mode "Peta" tampil BLANK di web (mode
        // Satelit/Hybrid tetap normal karena raster biasa, tidak
        // memerlukan WebGL). Untuk web, langsung pakai raster (Esri/Carto,
        // sama seperti mode Satelit) yang terbukti stabil di iframe,
        // bukan vector MapLibre GL.
        onlineVectorStyleUrl: Platform.OS === 'web' ? undefined : CONFIG.ONLINE_MAP_MODES.street.vectorStyleUrl,
        // Overlay footprint bangunan (vector) di atas mode Satelit/Hybrid.
        // HANYA diaktifkan di native (Android/iOS): MapLibre GL (WebGL)
        // terbukti tidak stabil di dalam sandbox `<iframe srcDoc>` yang
        // dipakai versi web (lihat catatan `onlineVectorStyleUrl` di atas),
        // jadi web tetap memakai citra satelit polos tanpa overlay ini.
        buildingOverlayStyleUrl: Platform.OS === 'web' ? undefined : CONFIG.ONLINE_MAP_MODES.street.vectorStyleUrl,
        offlinePmtilesUri,
        mapMode: 'street',
        markers,
        annotations: leafletAnnotations,
        // Toolbar gambar garis/polygon hanya ditampilkan saat mode anotasi
        // AKTIF pada peta satu paket; peta semua paket tidak pernah
        // menampilkannya.
        showDrawingTools: canEditAnnotations && annotateMode,
        packageSearchEnabled: isAllPackages,
        showLayerFilter: !isAllPackages,
        annotationsEditable: canEditAnnotations,
      });

      if (Platform.OS === 'web') {
        setMapHtmlContent(html);
        setWebviewKey((k) => k + 1);
        return;
      }
      const fileUri = `${FileSystem.cacheDirectory}map_${packageId || 'all'}_${Date.now()}.html`;
      await FileSystem.writeAsStringAsync(fileUri, html);
      setMapHtmlUri(fileUri);
      setWebviewKey((k) => k + 1);
    },
    [packageId, isAllPackages, canAnnotate, canEditAnnotations, annotateMode]
  );

  const initializeMap = useCallback(async (knownLocations?: SurveyedLocation[]) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const currentAnnotations = packageId
        ? isViewer
          ? await syncPackageAnnotationsFromPublicServer(packageId)
          : await syncPackageAnnotationsFromServer(packageId)
        : [];

      const locationsForRender = knownLocations ?? surveyedLocations;
      await rebuildMapHtml(locationsForRender, currentAnnotations);
    } catch (error: any) {
      console.warn('MapScreen init failed:', error?.message || error);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [canAnnotate, packageId, rebuildMapHtml, surveyedLocations, isViewer]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const locations = await loadSurveyedLocations();
        await initializeMap(locations);
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [packageId, annotateMode, isViewer])
  );


  /** Menangani pesan dari dalam WebView (lihat window.ReactNativeWebView di
   * leafletHtml.ts): penyimpanan anotasi baru (garis/polygon), penghapusan,
   * dan permintaan mengubah label anotasi yang sudah tersimpan. Hanya aktif
   * saat `canEditAnnotations` (peta satu paket & bukan akun Viewer). */
  const processMapMessage = useCallback(
    async (msg: any) => {
      if (!canEditAnnotations || !packageId) return;
      try {
        if (msg.type === 'save_annotation') {
          // Label anotasi HARUS berupa alamat/keterangan lokasi hasil survei
          // (kolom "Alamat/Keterangan Lokasi"), BUKAN nama paket pekerjaan —
          // karena itu `fallbackLabel` (nama paket) sengaja TIDAK dikirim di
          // sini, supaya label hanya terisi jika memang ada titik lokasi
          // survei terdekat dengan keterangan.
          const suggestedLabel = getSuggestedAnnotationLabel(msg.points, surveyedLocations);
          const choices = getLocationLabelChoices(allLocationNotes.map((note) => ({ locationNote: note })));
          setPendingShape({ type: msg.shapeType === 'polygon' ? 'polygon' : 'polyline', points: msg.points });
          setEditingAnnotationId(null);
          setLabelChoices(choices);
          setLabelInputValue(suggestedLabel || choices[0] || '');
          setLabelModalVisible(true);
        } else if (msg.type === 'delete_annotation') {
          const updated = await removePackageAnnotation(packageId, msg.id);
          await rebuildMapHtml(surveyedLocations, updated);
        } else if (msg.type === 'edit_annotation_label') {
          const currentAnnotations = await getPackageAnnotations(packageId);
          const target = currentAnnotations.find((a) => a.id === msg.id);
          const choices = getLocationLabelChoices(allLocationNotes.map((note) => ({ locationNote: note })));
          setPendingShape(null);
          setEditingAnnotationId(msg.id);
          setLabelChoices(choices);
          setLabelInputValue(target?.label || choices[0] || '');
          setLabelModalVisible(true);
        }
      } catch {
        // Pesan tidak dikenali/tidak valid: diabaikan.
      }
    },
    [canEditAnnotations, packageId, surveyedLocations, allLocationNotes, packageName, rebuildMapHtml]
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        void processMapMessage(msg);
      } catch {
        // Pesan tidak dikenali/tidak valid: diabaikan.
      }
    },
    [processMapMessage]
  );

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (msg && typeof msg.type === 'string') void processMapMessage(msg);
      } catch {
        // Pesan tidak dikenali/tidak valid: diabaikan.
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [processMapMessage]);

  const cancelLabelModal = useCallback(() => {
    setLabelModalVisible(false);
    setPendingShape(null);
    setEditingAnnotationId(null);
    setLabelInputValue('');
    setLabelChoices([]);
  }, []);

  const confirmLabelModal = useCallback(async () => {
    if (!packageId) return;
    // PENTING: nilai yang dipilih/diketik pengguna di modal (`labelInputValue`,
    // baik lewat chip alamat/keterangan lokasi maupun ketikan manual) HARUS
    // disimpan apa adanya. Sebelumnya nilai ini malah diproses ulang lewat
    // `buildAnnotationLabelFromSegment` yang memilih label "paling sering
    // muncul" antara nilai input & saran (`detailLabel`) â€” karena keduanya
    // biasanya sama-sama muncul 1x, hasilnya bisa menimpa pilihan pengguna
    // secara diam-diam (label yang tampil di modal tidak tersimpan). Sekarang
    // fallback ke saran otomatis HANYA dipakai jika kolom benar-benar
    // dikosongkan pengguna.
    const trimmedInput = labelInputValue.trim();
    const label = trimmedInput.length > 0
      ? trimmedInput
      : (pendingShape ? getSuggestedAnnotationLabel(pendingShape.points, surveyedLocations) : undefined);
    setLabelModalVisible(false);
    try {
      if (pendingShape) {
        const annotation: MapAnnotation = {
          id: makeId(),
          type: pendingShape.type,
          points: pendingShape.points,
          color: '#ef4444',
          label: label || undefined,
          createdAt: new Date().toISOString(),
        };
        const updated = await addPackageAnnotation(packageId, annotation);
        await rebuildMapHtml(surveyedLocations, updated);
      } else if (editingAnnotationId) {
        const updated = await updatePackageAnnotationLabel(packageId, editingAnnotationId, label || '');
        await rebuildMapHtml(surveyedLocations, updated);
      }
    } finally {
      setPendingShape(null);
      setEditingAnnotationId(null);
      setLabelInputValue('');
      setLabelChoices([]);
    }
  }, [labelInputValue, pendingShape, editingAnnotationId, packageId, surveyedLocations, packageName, rebuildMapHtml]);

  const toggleAnnotateMode = useCallback(() => {
    setAnnotateMode((prev) => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={async () => {
            const locations = await loadSurveyedLocations();
            await initializeMap(locations);
          }}
        >
          <Text style={styles.addButtonText}>↻ Titik</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => initializeMap()} disabled={loading}>
          <Text style={styles.addButtonText}>{loading ? '...' : '↻ Peta'}</Text>
        </TouchableOpacity>
        {canEditAnnotations && (
          <TouchableOpacity
            style={[styles.addButton, annotateMode && styles.addButtonActive]}
            onPress={toggleAnnotateMode}
          >
            <Text style={styles.addButtonText}>
              {annotateMode ? '✓ Anotasi Aktif' : 'Mode Anotasi'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.addButton, legendVisible && styles.addButtonActive]}
          onPress={() => setLegendVisible((prev) => !prev)}
        >
          <Text style={styles.addButtonText}>{legendVisible ? '✕ Tutup Info' : 'ℹ️ Info'}</Text>
        </TouchableOpacity>
      </View>

      {legendVisible && (
        <View style={styles.header}>
          <Text style={styles.title}>{isAllPackages ? 'Peta Lokasi Semua Paket' : 'Peta Lokasi Paket'}</Text>
          {!isAllPackages && <Text style={styles.subtitle}>{packageName}</Text>}
          <Text style={styles.subtitle}>
            Peta dimuat langsung dari internet (perlu koneksi aktif) dan selalu menampilkan data terbaru.
          </Text>
          <Text style={styles.metaText}>
            {locationsError
              ? locationsError
              : isAllPackages
              ? `${surveyedLocations.length} paket pekerjaan ditemukan.`
              : `${surveyedLocations.length} lokasi pekerjaan bertanda GPS ditemukan di paket ini.`}
          </Text>
        </View>
      )}

      <View style={styles.mapCard}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Memuat peta...</Text>
          </View>
        ) : Platform.OS === 'web' ? (
          !mapHtmlContent ? (
            <View style={styles.loadingBox}>
              <Text style={styles.loadingText}>Peta belum tersedia. Tekan "Muat Ulang Peta".</Text>
            </View>
          ) : (
            React.createElement('iframe', {
              key: webviewKey,
              srcDoc: mapHtmlContent,
              style: { flex: 1, width: '100%', height: '100%', border: 'none', borderRadius: 12 },
            })
          )
        ) : !mapHtmlUri ? (
          <View style={styles.loadingBox}>
            <Text style={styles.loadingText}>Peta belum tersedia. Tekan "Muat Ulang Peta".</Text>
          </View>
        ) : (
          <WebView
            key={webviewKey}
            ref={webviewRef}
            style={styles.webview}
            source={{ uri: mapHtmlUri }}
            originWhitelist={['*']}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
            domStorageEnabled
            // PENTING: JANGAN set androidLayerType="software" di sini. Mode
            // "Peta" (street) memakai MapLibre GL (vector, dirender lewat
            // WebGL) untuk menampilkan basemap OpenStreetMap penuh — WebGL
            // MEMBUTUHKAN hardware acceleration (layer GPU), sehingga jika
            // WebView dipaksa memakai rendering software (seperti pada
            // CoordinatePickerModal untuk tile Leaflet biasa), canvas
            // MapLibre GL tetap KOSONG/BLANK meski mode Satelit/Hybrid
            // (raster biasa) tetap tampil normal. Bug tile Leaflet terpotong
            // yang tadinya diatasi androidLayerType="software" di layar lain
            // sudah ditangani di sini lewat remount WebView (lihat
            // `webviewKey` yang berubah setiap `rebuildMapHtml`), jadi
            // software layer tidak diperlukan.
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            onError={(e) => console.warn('WebView error:', e.nativeEvent)}
            onHttpError={(e) => console.warn('WebView HTTP error:', e.nativeEvent)}
            onRenderProcessGone={(e) => console.warn('WebView render process gone:', e.nativeEvent)}
          />
        )}
      </View>
      {canEditAnnotations && (
        <Modal visible={labelModalVisible} transparent animationType="fade" onRequestClose={cancelLabelModal}>
          <KeyboardAvoidingView
            style={styles.modalBackdrop}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
          >
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {editingAnnotationId ? 'Ubah Label Anotasi' : 'Beri Label Anotasi'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Contoh: "Saluran Sekunder RT 03" atau "Rute Jalan Usulan". Boleh dikosongkan.
                </Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Label/keterangan (opsional)"
                  value={labelInputValue}
                  onChangeText={setLabelInputValue}
                  autoFocus
                />
                {labelChoices.length > 0 && (
                  <View style={styles.choiceList}>
                    {labelChoices.map((choice) => (
                      <TouchableOpacity
                        key={choice}
                        style={[styles.choiceChip, labelInputValue === choice && styles.choiceChipSelected]}
                        onPress={() => setLabelInputValue(choice)}
                      >
                        <Text style={[styles.choiceChipText, labelInputValue === choice && styles.choiceChipTextSelected]}>
                          {choice}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.modalButton, styles.modalButtonSecondary]} onPress={cancelLabelModal}>
                    <Text style={styles.modalButtonSecondaryText}>Batal</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={confirmLabelModal}>
                    <Text style={styles.modalButtonPrimaryText}>Simpan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {legendVisible && (
        <ScrollView style={styles.legend}>
          <Text style={styles.legendTitle}>Fitur peta</Text>
          <Text style={styles.legendItem}>• Peta dimuat langsung dari internet (tile online), sehingga selalu menampilkan basemap terkini. Diperlukan koneksi internet aktif.</Text>
          <Text style={styles.legendItem}>• Peta mendukung cubit (pinch) zoom & geser (pan) dengan jari secara langsung di dalam tampilan peta.</Text>
          {canAnnotate && (
            <>
              <Text style={styles.legendItem}>• Titik berwarna menandai lokasi asli (GPS) tiap item pekerjaan yang sudah disurvei, warna sesuai jenis infrastruktur.</Text>
              {canEditAnnotations ? (
                <>
                  <Text style={styles.legendItem}>• Aktifkan "Mode Anotasi" untuk menampilkan tombol "Garis"/"Polygon" di dalam peta, lalu ketuk peta untuk menambah titik dan tekan "Selesai &amp; Simpan".</Text>
                  <Text style={styles.legendItem}>• Setelah menekan "Selesai &amp; Simpan", isi label/keterangan pada anotasi (mis. nama saluran/rute) lalu tekan "Simpan".</Text>
                  <Text style={styles.legendItem}>• Ketuk anotasi (garis/polygon) yang sudah tersimpan untuk melihat opsi ubah label atau hapus.</Text>
                </>
              ) : (
                <Text style={styles.legendItem}>• Ketuk anotasi (garis/polygon) yang sudah tersimpan untuk melihat labelnya. Akun Viewer hanya bisa melihat peta & anotasi, tidak bisa menambah atau mengubahnya.</Text>
              )}
            </>
          )}
          <Text style={styles.legendItem}>• Tekan "Muat Ulang Peta" jika ingin memuat ulang tampilan peta atau data terbaru.</Text>
        </ScrollView>
      )}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 8,
  },
  header: {
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: theme.font.semiBold as any,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addButtonActive: {
    backgroundColor: '#0f766e',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  metaText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  mapCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
    marginBottom: 4,
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    borderRadius: 12,
  },
  loadingBox: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textPrimary,
    marginTop: 12,
    fontWeight: '600',
  },
  legend: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginTop: 4,
    maxHeight: 200,
  },
  legendTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    marginBottom: 8,
  },
  legendItem: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  modalScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 12,
  },
  choiceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  choiceChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  choiceChipSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  choiceChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  choiceChipTextSelected: {
    color: '#1d4ed8',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalButtonSecondary: {
    backgroundColor: '#e2e8f0',
  },
  modalButtonSecondaryText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 13,
  },
  modalButtonPrimary: {
    backgroundColor: '#0f766e',
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});



