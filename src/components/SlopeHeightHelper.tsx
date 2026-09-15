import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { computeVerticalHeightFromSlopeText } from '../utils/slopeHeight';

interface Props {
  /** Dipanggil dengan tinggi vertikal (string, 2 desimal) saat tombol "Terapkan" ditekan. */
  onApply: (verticalHeight: string) => void;
  disabled?: boolean;
}

/**
 * Kalkulator kecil untuk mengonversi hasil ukur TINGGI MIRING (menyusuri
 * permukaan dinding yang miring, mis. pakai pita ukur) + SUDUT KEMIRINGAN
 * (dari klinometer/aplikasi sudut di HP, diukur dari bidang horizontal)
 * menjadi TINGGI VERTIKAL secara otomatis, dipakai di form Dinding Penahan
 * Tanah (DPT) agar surveyor tidak perlu menghitung trigonometri manual.
 *
 * Rumus: Tinggi Vertikal = Tinggi Miring × sin(sudut).
 */
export default function SlopeHeightHelper({ onApply, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [slopeLength, setSlopeLength] = useState('');
  const [angle, setAngle] = useState('');

  const result = computeVerticalHeightFromSlopeText(slopeLength, angle);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} disabled={disabled}>
        <Text style={styles.toggleText}>
          {expanded ? '▲ Sembunyikan' : '📐 Hitung dari Tinggi Miring & Sudut'}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.box}>
          <Text style={styles.hint}>
            Isi tinggi miring (diukur menyusuri permukaan dinding) dan sudut kemiringan terhadap
            bidang datar (0°-90°, dari klinometer/aplikasi sudut), tinggi vertikal dihitung otomatis.
          </Text>
          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Tinggi Miring (m)</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: 2.5"
                keyboardType="numeric"
                value={slopeLength}
                onChangeText={setSlopeLength}
                editable={!disabled}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Sudut (derajat)</Text>
              <TextInput
                style={styles.input}
                placeholder="Contoh: 60"
                keyboardType="numeric"
                value={angle}
                onChangeText={setAngle}
                editable={!disabled}
              />
            </View>
          </View>
          <Text style={styles.resultText}>
            Tinggi Vertikal: {result ? `${result} m` : '-'}
          </Text>
          <TouchableOpacity
            style={[styles.applyButton, (!result || disabled) && styles.applyButtonDisabled]}
            onPress={() => result && onApply(result)}
            disabled={!result || disabled}
          >
            <Text style={styles.applyButtonText}>Terapkan ke Tinggi</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  toggleText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  box: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  hint: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8 },
  field: { flex: 1 },
  fieldLabel: { fontSize: 12, color: '#334155', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  resultText: { marginTop: 8, fontSize: 13, fontWeight: '600', color: '#0f172a' },
  applyButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  applyButtonDisabled: { backgroundColor: '#94a3b8' },
  applyButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
