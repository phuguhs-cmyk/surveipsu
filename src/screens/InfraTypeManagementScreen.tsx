import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { listInfraTypes, addInfraType, deleteInfraType } from '../services/apiService';
import { INFRASTRUCTURE_TYPES } from '../config';

type Props = NativeStackScreenProps<RootStackParamList, 'InfraTypeManagement'>;

export default function InfraTypeManagementScreen({ navigation }: Props) {
  const [dynamicTypes, setDynamicTypes] = useState<{ name: string; sheetName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTypeName, setNewTypeName] = useState('');
  const [adding, setAdding] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listInfraTypes();
      setDynamicTypes(result.dynamicTypes);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadTypes(); }, [loadTypes]));

  const handleAdd = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addInfraType(name);
      setNewTypeName('');
      await loadTypes();
    } catch (err: any) {
      Alert.alert('Gagal Menambah', err?.message || 'Terjadi kesalahan.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (typeName: string) => {
    Alert.alert(
      'Hapus Jenis Infrastruktur',
      `Hapus "${typeName}"? Data survei yang sudah ada tidak ikut terhapus, hanya jenis ini tidak akan muncul lagi di pilihan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus', style: 'destructive',
          onPress: async () => {
            try {
              await deleteInfraType(typeName);
              await loadTypes();
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan.');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <Text style={styles.title}>Kelola Jenis Infrastruktur</Text>

      <Text style={styles.sectionLabel}>Jenis Bawaan (tidak dapat dihapus)</Text>
      {INFRASTRUCTURE_TYPES.map((t) => (
        <View key={t} style={styles.builtinRow}>
          <Text style={styles.builtinText}>{t}</Text>
        </View>
      ))}

      <Text style={styles.sectionLabel}>Tambah Jenis Baru</Text>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Contoh: SPAM, IPAL, Embung..."
          value={newTypeName}
          onChangeText={setNewTypeName}
        />
        <TouchableOpacity
          style={[styles.addBtn, (!newTypeName.trim() || adding) && styles.btnDisabled]}
          onPress={handleAdd}
          disabled={!newTypeName.trim() || adding}
        >
          {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addBtnText}>+ Tambah</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Jenis Tambahan ({dynamicTypes.length})</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={dynamicTypes}
          keyExtractor={(item) => item.name}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada jenis infrastruktur tambahan.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.name)}>
                <Text style={styles.deleteBtnText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 16, marginBottom: 8 },
  builtinRow: {
    backgroundColor: '#f1f5f9', borderRadius: 8, padding: 10,
    marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0',
  },
  builtinText: { fontSize: 14, color: '#64748b' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, backgroundColor: '#fff',
  },
  addBtn: {
    backgroundColor: '#2563eb', borderRadius: 8,
    paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#93c5fd' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', flex: 1 },
  deleteBtn: { backgroundColor: '#fee2e2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  deleteBtnText: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 16 },
});
