import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Alert } from '../utils/alert';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { listUsers, createUser, updateUser, deleteUser } from '../services/apiService';
import { getCurrentUser } from '../services/authService';
import { ManagedUser, UserPermissions } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserManagement'>;

const DEFAULT_PERMISSIONS: UserPermissions = {
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canPost: true,
};

const PERMISSION_LABELS: { key: keyof UserPermissions; label: string }[] = [
  { key: 'canCreate', label: 'Boleh menambah data survei baru' },
  { key: 'canEdit', label: 'Boleh mengubah data survei' },
  { key: 'canDelete', label: 'Boleh menghapus data survei' },
  { key: 'canPost', label: 'Boleh memposting data/paket survei' },
];

/**
 * Layar khusus admin untuk mengelola akun pengguna (surveyor & admin lain).
 */
export default function UserManagementScreen({ navigation }: Props) {
  const [adminUsername, setAdminUsername] = useState<string | undefined>(undefined);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<'admin' | 'user' | 'viewer'>('user');

  const [formPermissions, setFormPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setAdminUsername(currentUser?.username);
      if (!currentUser?.username) return;
      const list = await listUsers(currentUser.username);
      setUsers(list);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil daftar pengguna.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUsers();
    }, [loadUsers])
  );

  const openCreateModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormName('');
    setFormRole('user');
    setFormPermissions(DEFAULT_PERMISSIONS);
    setModalVisible(true);
  };

  const openEditModal = (u: ManagedUser) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword('');
    setFormName(u.name);
    setFormRole(u.role);
    setFormPermissions(u.permissions);
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  const filteredUsers = users.filter((user) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      user.name.toLowerCase().includes(q) ||
      user.username.toLowerCase().includes(q) ||
      user.role.toLowerCase().includes(q)
    );
  });

  const togglePermission = (key: keyof UserPermissions) => {
    setFormPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!adminUsername) return;

    if (!editingUser) {
      if (!formUsername.trim() || !formPassword.trim()) {
        Alert.alert('Data Belum Lengkap', 'Username dan password wajib diisi.');
        return;
      }
      setSaving(true);
      try {
        await createUser({
          adminUsername,
          newUsername: formUsername.trim(),
          newPassword: formPassword.trim(),
          newName: formName.trim() || formUsername.trim(),
          newRole: formRole,
          newPermissions: formPermissions,
          newAllowedTypes: null,
        });
        setModalVisible(false);
        await loadUsers();
      } catch (err: any) {
        Alert.alert('Gagal Menambahkan', err?.message || 'Terjadi kesalahan.');
      } finally {
        setSaving(false);
      }
    } else {
      setSaving(true);
      try {
        await updateUser({
          adminUsername,
          targetUsername: editingUser.username,
          newName: formName.trim(),
          newRole: formRole,
          newPassword: formPassword.trim() || undefined,
          newPermissions: formPermissions,
          newAllowedTypes: null,
        });
        setModalVisible(false);
        await loadUsers();
      } catch (err: any) {
        Alert.alert('Gagal Memperbarui', err?.message || 'Terjadi kesalahan.');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleDelete = (u: ManagedUser) => {
    if (u.username === adminUsername) {
      Alert.alert('Tidak Bisa Dihapus', 'Anda tidak dapat menghapus akun Anda sendiri.');
      return;
    }
    Alert.alert('Hapus Pengguna', `Yakin ingin menghapus akun "${u.username}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUser(adminUsername!, u.username);
            await loadUsers();
          } catch (err: any) {
            Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan.');
          }
        },
      },
    ]);
  };


  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.subtitle}>
          Kelola akun surveyor & admin, serta atur izin (tambah/edit/hapus/posting) tiap akun.
        </Text>
        <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
          <Text style={styles.addButtonText}>+ Tambah</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Cari nama, username, atau role..."
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.username}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Tidak ada akun yang cocok dengan pencarian.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text
                  style={
                    item.role === 'admin'
                      ? styles.adminBadge
                      : item.role === 'viewer'
                      ? styles.viewerBadge
                      : styles.userBadge
                  }
                >
                  {item.role === 'admin' ? 'Admin' : item.role === 'viewer' ? 'Viewer' : 'User'}
                </Text>
              </View>
              <Text style={styles.cardText}>Username: {item.username}</Text>
              {item.role === 'user' && (
                <Text style={styles.cardPermissions}>
                  Izin:{' '}
                  {PERMISSION_LABELS.filter((p) => item.permissions[p.key])
                    .map((p) => p.label.replace('Boleh ', ''))
                    .join(', ') || 'Tidak ada izin'}
                </Text>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, item.username === adminUsername && styles.buttonDisabled]}
                  onPress={() => handleDelete(item)}
                  disabled={item.username === adminUsername}
                >
                  <Text style={styles.deleteButtonText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}


      <Modal visible={modalVisible} animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <KeyboardAwareScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            extraScrollHeight={24}
            extraHeight={100}
          >
            <Text style={styles.modalTitle}>
              {editingUser ? `Edit Pengguna: ${editingUser.username}` : 'Tambah Pengguna Baru'}
            </Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={[styles.input, editingUser ? styles.inputDisabled : null]}
              value={formUsername}
              onChangeText={setFormUsername}
              autoCapitalize="none"
              editable={!editingUser}
              placeholder="mis. budi.surveyor"
            />

            <Text style={styles.label}>
              Password {editingUser ? '(kosongkan jika tidak ingin mengubah)' : ''}
            </Text>
            <TextInput
              style={styles.input}
              value={formPassword}
              onChangeText={setFormPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder={editingUser ? 'Password baru (opsional)' : 'Password'}
            />

            <Text style={styles.label}>Nama Lengkap</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Nama" />

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleChip, formRole === 'user' && styles.roleChipActive]}
                onPress={() => setFormRole('user')}
              >
                <Text style={[styles.roleChipText, formRole === 'user' && styles.roleChipTextActive]}>
                  User (Surveyor)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleChip, formRole === 'admin' && styles.roleChipActive]}
                onPress={() => setFormRole('admin')}
              >
                <Text style={[styles.roleChipText, formRole === 'admin' && styles.roleChipTextActive]}>
                  Admin
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleChip, formRole === 'viewer' && styles.roleChipActive]}
                onPress={() => setFormRole('viewer')}
              >
                <Text style={[styles.roleChipText, formRole === 'viewer' && styles.roleChipTextActive]}>
                  Viewer (Lihat Semua Data, Read-only)
                </Text>
              </TouchableOpacity>
            </View>

            {formRole === 'user' && (
              <>
                <Text style={styles.label}>Izin Akses (khusus role User)</Text>
                {PERMISSION_LABELS.map((p) => (
                  <View key={p.key} style={styles.permissionRow}>
                    <Text style={styles.permissionLabel}>{p.label}</Text>
                    <Switch value={formPermissions[p.key]} onValueChange={() => togglePermission(p.key)} />
                  </View>
                ))}
              </>
            )}

            {formRole === 'viewer' && (
              <Text style={styles.cardPermissions}>
                Akun Viewer bisa melihat SELURUH data/laporan apa pun statusnya (draft, proses, maupun
                sudah "Survei Selesai"), tanpa menampilkan nama surveyor, dan tidak dapat menambah,
                mengubah, menghapus, atau memposting data apa pun.
              </Text>
            )}


            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelButtonText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Simpan</Text>}
              </TouchableOpacity>
            </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  subtitle: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  adminBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  userBadge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  viewerBadge: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardText: {
    fontSize: 13,
    color: '#334155',
  },
  cardPermissions: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  roleChipText: {
    color: '#334155',
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#fff',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  permissionLabel: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    marginRight: 8,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
