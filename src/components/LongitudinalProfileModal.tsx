import React, { useRef, useState, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import LongitudinalProfileSchema from './schemas/LongitudinalProfileSchema';
import { buildLongitudinalProfile, PROFILE_SERIES_CONFIG, ProfileSegmentInput } from '../utils/longitudinalProfile';
import { captureSchemaAsPhoto } from '../services/schemaCaptureService';
import { SurveyPhoto } from '../types';

interface Props {
  visible: boolean;
  infrastructureType: string;
  /** Segmen dari item pekerjaan yang sama, tidak perlu sudah terurut. */
  segments: { staStart: string; staEnd: string; values: Record<string, string> }[];
  onClose: () => void;
  /** Opsional: jika diisi, tombol "Simpan sebagai Foto" ditampilkan. */
  onSave?: (photo: SurveyPhoto) => void;
}

/**
 * Modal profil memanjang (longitudinal profile): menyambungkan ukuran
 * (lebar/tinggi/kedalaman) SEMUA segmen satu item pekerjaan dari STA awal
 * hingga akhir, melengkapi skema penampang melintang per-segmen yang sudah
 * ada (SchemaPreviewModal). Cocok untuk Jalan, Drainase, dan Dinding
 * Penahan Tanah (DPT) — jenis infrastruktur yang bersegmen berdasarkan STA.
 */
export default function LongitudinalProfileModal({ visible, infrastructureType, segments, onClose, onSave }: Props) {
  const svgRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [tptReference, setTptReference] = useState<'actual' | 'top' | 'bottom'>('actual');

  const profile = useMemo(() => {
    const seriesDefs = PROFILE_SERIES_CONFIG[infrastructureType] || [];
    const inputs: ProfileSegmentInput[] = segments.map((s) => ({
      staStart: s.staStart,
      staEnd: s.staEnd,
      get: (key: string) => s.values[key],
    }));
    return buildLongitudinalProfile(inputs, seriesDefs);
  }, [infrastructureType, segments]);

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const photo = await captureSchemaAsPhoto(svgRef, `profil_memanjang_${Date.now()}.jpg`);
      if (photo) {
        onSave(photo);
        onClose();
      } else {
        alert?.('Gagal menyimpan profil sebagai foto.');
      }
    } finally {
      setSaving(false);
    }
  };

  const hasData = segments.length > 0 && profile.totalLength > 0;
  const hasTptElevation = infrastructureType === 'Dinding Penahan Tanah (DPT)' && segments.some((segment) =>
    segment.values.baseElevationStart?.trim() || segment.values.baseElevationEnd?.trim()
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Profil Memanjang (Longitudinal)</Text>
          <Text style={styles.hint}>
            Grafik menyambungkan ukuran tiap segmen dari STA awal hingga STA akhir item pekerjaan ini, digambar otomatis dari data yang sudah diisi.
          </Text>
          {infrastructureType === 'Dinding Penahan Tanah (DPT)' && !hasTptElevation && (
            <Text style={styles.relativeHint}>
              Elevasi belum diisi. Grafik menggunakan acuan relatif; isi elevasi jika tersedia agar posisinya absolut.
            </Text>
          )}
          {infrastructureType === 'Dinding Penahan Tanah (DPT)' && (
            <>
              <Text style={styles.referenceLabel}>
                Tampilan: {tptReference === 'actual' ? 'Aktual' : tptReference === 'top' ? 'Acuan Top' : 'Acuan Bottom'}
              </Text>
              <View style={styles.referenceRow}>
                {[
                  ['actual', 'Aktual'],
                  ['top', 'Acuan Top'],
                  ['bottom', 'Acuan Bottom'],
                ].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.referenceButton, tptReference === value && styles.referenceButtonActive]}
                    onPress={() => setTptReference(value as 'actual' | 'top' | 'bottom')}
                  >
                    <Text style={[styles.referenceButtonText, tptReference === value && styles.referenceButtonTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <ScrollView style={styles.schemaScroll} contentContainerStyle={styles.schemaWrapper}>
            {hasData ? (
              <LongitudinalProfileSchema
                svgRef={svgRef}
                title={infrastructureType}
                profile={profile}
                tptReference={tptReference}
              />
            ) : (
              <Text style={styles.emptyText}>
                Isi STA Awal & STA Akhir yang valid pada segmen-segmen terlebih dahulu untuk melihat profil memanjang.
              </Text>
            )}
          </ScrollView>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.secondaryBtnText}>Tutup</Text>
            </TouchableOpacity>
            {onSave && (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving || !hasData}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Simpan sebagai Foto</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function LongitudinalProfilePreview({
  infrastructureType,
  segments,
}: Pick<Props, 'infrastructureType' | 'segments'>) {
  const profile = useMemo(() => {
    const seriesDefs = PROFILE_SERIES_CONFIG[infrastructureType] || [];
    return buildLongitudinalProfile(
      segments.map((segment) => ({
        staStart: segment.staStart,
        staEnd: segment.staEnd,
        get: (key: string) => segment.values[key],
      })),
      seriesDefs
    );
  }, [infrastructureType, segments]);

  if (segments.length === 0 || profile.totalLength <= 0) {
    return <Text style={styles.emptyText}>Isi STA awal dan STA akhir untuk melihat preview.</Text>;
  }

  return (
    <View style={styles.previewBox}>
      <LongitudinalProfileSchema title={infrastructureType} profile={profile} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: 380, maxWidth: '95%', maxHeight: '85%' },
  title: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  hint: { fontSize: 11, color: '#64748b', marginBottom: 10 },
  relativeHint: { fontSize: 11, color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 6, padding: 7, marginBottom: 8 },
  referenceRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  referenceLabel: { fontSize: 11, color: '#475569', fontWeight: '600', marginBottom: 5 },
  referenceButton: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7, paddingVertical: 8, alignItems: 'center' },
  referenceButtonActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  referenceButtonText: { color: '#334155', fontSize: 11, fontWeight: '600' },
  referenceButtonTextActive: { color: '#fff' },
  schemaScroll: { maxHeight: 420 },
  schemaWrapper: { alignItems: 'center', marginBottom: 14, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 },
  previewBox: { alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: 6, overflow: 'hidden' },
  emptyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 16 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
