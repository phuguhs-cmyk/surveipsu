import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { KeyboardAwareFlatList } from 'react-native-keyboard-aware-scroll-view';

/**
 * Modal pilihan dengan pencarian, dipakai untuk dropdown yang bisa berisi
 * banyak pilihan (mis. daftar Desa/Kelurahan per Kecamatan yang jumlahnya
 * bisa ratusan). Tidak memakai library Picker eksternal karena belum ada
 * dependency semacam itu di proyek ini; komponen ini dibangun dari
 * primitif React Native (Modal + FlatList) yang sudah dipakai di tempat
 * lain (mis. SketchCanvasModal), sehingga tetap konsisten dan bekerja baik
 * di Android maupun saat dijalankan lewat browser (expo start --web).
 */

interface Props {
  visible: boolean;
  title: string;
  options: string[];
  onSelect: (value: string) => void;
  onClose: () => void;
  emptyText?: string;
}

export default function SearchableSelectModal({ visible, title, options, onSelect, onClose, emptyText }: Props) {
  const [query, setQuery] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setKeyboardHeight(0);
      return;
    }

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (value: string) => {
    setQuery('');
    onSelect(value);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
          style={[
            styles.keyboardContainer,
            Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 12 } : null,
          ]}
        >
          <View style={styles.sheet}>
            <Text style={styles.title}>{title}</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari..."
              value={query}
              onChangeText={setQuery}
              autoFocus
              returnKeyType="search"
            />
            <KeyboardAwareFlatList
              data={filtered}
              keyExtractor={(item) => item}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              enableOnAndroid
              extraScrollHeight={Platform.OS === 'android' ? 120 : 24}
              showsVerticalScrollIndicator
              ListEmptyComponent={
                <Text style={styles.emptyText}>{emptyText || 'Tidak ada pilihan yang cocok.'}</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.option} onPress={() => handleSelect(item)}>
                  <Text style={styles.optionText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '82%',
    flexShrink: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  list: {
    flexGrow: 0,
    maxHeight: 360,
  },
  listContent: {
    paddingBottom: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionText: {
    fontSize: 15,
    color: '#1e293b',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    paddingVertical: 24,
  },
  closeBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  closeBtnText: {
    color: '#334155',
    fontWeight: '600',
  },
});
