import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { login, getCurrentUser } from '../services/authService';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // OPTIMASI: Timeout turun dari 3.5s → 2s. currentUser cache biasanya sudah
        // tersedia dalam milliseconds; jika AsyncStorage lambat, lebih baik tampilkan
        // form login setelah 2 detik daripada membiarkan user menunggu spinner lama.
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 2000);
        });
        const existingUser = await Promise.race<any>([
          getCurrentUser(),
          timeoutPromise,
        ]);
        if (existingUser) {
          if (existingUser.role === 'admin') {
            navigation.replace('AdminDashboard');
          } else if (existingUser.role === 'viewer') {
            navigation.replace('PublicPackageList');
          } else {
            navigation.replace('PackageList', { surveyorName: existingUser.name });
          }
          return;
        }
      } catch {
        // Jika pembacaan sesi tersimpan (AsyncStorage) gagal, JANGAN biarkan
        // layar ini tergantung selamanya di spinner — anggap saja belum ada
        // sesi tersimpan dan tampilkan form login seperti biasa, supaya
        // pengguna tetap bisa login secara manual.
      }
      setLoading(false);
    })();
  }, [navigation]);

  const handleLogin = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) return;
    setSubmitting(true);
    try {
      const user = await login(trimmedUsername, password);
      if (user.role === 'admin') {
        navigation.replace('AdminDashboard');
      } else if (user.role === 'viewer') {
        navigation.replace('PublicPackageList');
      } else {
        navigation.replace('PackageList', { surveyorName: user.name });
      }
    } catch (err: any) {
      Alert.alert('Gagal Masuk', err?.message || 'Username atau password salah.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={24}
        extraHeight={100}
      >
        <Text style={styles.orgName}>Bidang Perumahan DPKPLH Banjarnegara</Text>
        <Text style={styles.title}>Survei Infrastruktur PSU</Text>
        <Text style={styles.subtitle}>Masuk menggunakan akun surveyor atau administrator</Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.button, (!username.trim() || !password || submitting) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={!username.trim() || !password || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Masuk</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  orgName: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  buttonText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: theme.font.semiBold,
  },
});

