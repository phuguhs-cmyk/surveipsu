import React from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import { getCurrentUser } from './src/services/authService';
import { theme } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import PackageListScreen from './src/screens/PackageListScreen';
import CreatePackageScreen from './src/screens/CreatePackageScreen';
import PackageDetailScreen from './src/screens/PackageDetailScreen';
import MapScreen from './src/screens/MapScreen';
import WorkItemFormScreen from './src/screens/WorkItemFormScreen';
import QueueScreen from './src/screens/QueueScreen';
import AdminDashboardScreen from './src/screens/AdminDashboardScreen';
import UserManagementScreen from './src/screens/UserManagementScreen';
import PackageDataScreen from './src/screens/PackageDataScreen';
import PackageReportScreen from './src/screens/PackageReportScreen';
import AllPackagesReportScreen from './src/screens/AllPackagesReportScreen';
import EditItemScreen from './src/screens/EditItemScreen';
import InfraTypeManagementScreen from './src/screens/InfraTypeManagementScreen';
import PublicPackageListScreen from './src/screens/PublicPackageListScreen';
import PublicPackageDataScreen from './src/screens/PublicPackageDataScreen';


const Stack = createNativeStackNavigator<RootStackParamList>();

// Ref navigasi global, dipakai oleh toolbar web (DesktopNavToolbar) supaya bisa
// memanggil navigate/goBack/reset tanpa harus berada di dalam context
// Stack.Navigator (mis. headerLeft sering tidak konsisten dirender oleh
// react-native-screens saat berjalan di web/browser desktop).
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Nama layar yang dianggap sebagai "beranda" per-role, dipakai tombol Home
// pada toolbar desktop supaya bisa lompat langsung ke sana dari layar mana pun,
// tanpa harus menekan tombol kembali berkali-kali sampai ke Dashboard.
async function resolveHomeRoute(): Promise<{ name: keyof RootStackParamList; params?: any }> {
  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      if (currentUser.role === 'admin') {
        return { name: 'AdminDashboard' };
      }
      if (currentUser.role === 'viewer') {
        return { name: 'PublicPackageList' };
      }
      return { name: 'PackageList', params: { surveyorName: currentUser.name || '' } };
    }
  } catch {
    // fallback jika data user tidak terbaca
  }
  return { name: 'Login' };
}

// Toolbar navigasi mengambang khusus browser desktop (web). Dipasang di luar
// Stack.Navigator (bukan sebagai headerLeft) agar selalu tampil konsisten di
// semua layar, termasuk layar-layar "dalam" (form/edit) yang headernya
// menyembunyikan tombol back bawaan (headerBackVisible: false). Dengan ini,
// pengguna bisa lompat langsung ke Dashboard atau mundur satu langkah dari
// layar manapun tanpa perlu reload/kembali manual berkali-kali.
//
// Toolbar ini bisa disembunyikan (hide) & dimunculkan lagi (unhide) lewat
// tombol panah kecil di ujung kanan, preferensinya disimpan di
// `localStorage` (khusus web) supaya tetap sama setelah reload halaman.
const NAV_TOOLBAR_HIDDEN_KEY = 'desktopNavToolbarHidden';

function DesktopNavToolbar() {
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      setHidden(window.localStorage.getItem(NAV_TOOLBAR_HIDDEN_KEY) === '1');
    } catch {
      // localStorage tidak tersedia (mis. mode privat ketat): abaikan, tetap tampil.
    }
  }, []);

  if (Platform.OS !== 'web') return null;

  const toggleHidden = () => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(NAV_TOOLBAR_HIDDEN_KEY, next ? '1' : '0');
      } catch {
        // abaikan jika localStorage tidak bisa ditulis
      }
      return next;
    });
  };

  const goHome = async () => {
    const home = await resolveHomeRoute();
    if (!navigationRef.isReady()) return;
    try {
      navigationRef.reset({ index: 0, routes: [{ name: home.name, params: home.params } as any] });
    } catch {
      navigationRef.navigate(home.name as any, home.params);
    }
  };

  const goBack = () => {
    if (!navigationRef.isReady()) return;
    if (navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  };

  const goForward = () => {
    if (typeof window !== 'undefined') {
      window.history.forward();
    }
  };

  // Saat disembunyikan, hanya tombol toggle kecil ("▼") yang tetap tampil
  // di pojok kiri atas agar toolbar tetap bisa dimunculkan kembali kapan
  // saja, tanpa pengguna "terjebak" tanpa cara membukanya lagi.
  if (hidden) {
    return (
      <View
        style={{
          flexDirection: 'row',
          paddingVertical: 4,
          paddingHorizontal: 8,
          backgroundColor: theme.colors.primarySoftBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.primaryBorder,
        }}
      >
        <TouchableOpacity
          onPress={toggleHidden}
          accessibilityLabel="Tampilkan toolbar navigasi"
          style={{ paddingVertical: 4, paddingHorizontal: 10 }}
        >
          <Text style={{ fontSize: 12, fontWeight: theme.font.semiBold, color: theme.colors.primaryDark }}>▼ Toolbar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.primarySoftBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.primaryBorder,
      }}
    >
      <TouchableOpacity
        onPress={goHome}
        accessibilityLabel="Dashboard"
        style={{ paddingVertical: 4, paddingHorizontal: 10, backgroundColor: theme.colors.primary, borderRadius: theme.radius.xs }}
      >
        <Text style={{ fontSize: 12, fontWeight: theme.font.semiBold, color: '#fff' }}>🏠 Dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={goBack} accessibilityLabel="Kembali" style={{ paddingVertical: 4, paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: theme.font.semiBold, color: theme.colors.primaryDark }}>◀ Kembali</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={goForward} accessibilityLabel="Maju" style={{ paddingVertical: 4, paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: theme.font.semiBold, color: theme.colors.primaryDark }}>Maju ▶</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={toggleHidden}
        accessibilityLabel="Sembunyikan toolbar navigasi"
        style={{ paddingVertical: 4, paddingHorizontal: 10, marginLeft: 'auto' }}
      >
        <Text style={{ fontSize: 12, fontWeight: theme.font.semiBold, color: theme.colors.primaryDark }}>▲ Sembunyikan</Text>
      </TouchableOpacity>
    </View>
  );
}

// Di build APK/standalone Android, warna hint/placeholder default TextInput
// mengikuti tema native perangkat (textColorHint) dan seringkali nyaris tak
// terlihat (abu-abu sangat terang) di atas background putih, berbeda dengan
// Expo Go yang menerapkan styling konsisten sendiri. Set default global agar
// placeholder selalu terlihat jelas di kedua environment.
(TextInput as any).defaultProps = (TextInput as any).defaultProps || {};
(TextInput as any).defaultProps.placeholderTextColor = theme.colors.textMuted;

// Judul header kustom untuk seluruh layar (Android/iOS native header maupun
// web): HANYA menampilkan nama unit kerja "DPKPLH Banjarnegara" (judul nama
// layar per-menu, mis. "Dashboard Admin", "Peta Offline", dsb. SENGAJA tidak
// ditampilkan lagi di sini sesuai permintaan).
function ScreenHeaderTitle({ title }: { title: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text
        style={{ fontSize: 15, fontWeight: theme.font.semiBold, color: theme.colors.textPrimary }}
        numberOfLines={1}
        accessibilityLabel={title}
      >
        DPKPLH Banjarnegara
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="auto" />
      <DesktopNavToolbar />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.textPrimary,
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Masuk', headerTitle: () => <ScreenHeaderTitle title="Masuk" /> }} />
        <Stack.Screen
          name="PackageList"
          component={PackageListScreen}
          options={{ title: 'Paket Pekerjaan', headerBackVisible: false, headerTitle: () => <ScreenHeaderTitle title="Paket Pekerjaan" /> }}
        />
        <Stack.Screen
          name="CreatePackage"
          component={CreatePackageScreen}
          options={{ title: 'Buat Paket Pekerjaan', headerTitle: () => <ScreenHeaderTitle title="Buat Paket Pekerjaan" /> }}
        />
        <Stack.Screen
          name="PackageDetail"
          component={PackageDetailScreen}
          options={{ title: 'Detail Paket', headerTitle: () => <ScreenHeaderTitle title="Detail Paket" /> }}
        />
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={({ route }) => {
            // Judul header navigasi HARUS menampilkan nama paket pekerjaan
            // (mis. "Peta Lokasi - Rehab Jalan Desa X"), bukan judul statis
            // generik, supaya pengguna langsung tahu peta paket mana yang
            // sedang dibuka. Jika dibuka tanpa packageId (mode "semua
            // paket" dari menu admin/surveyor), tetap pakai judul umum.
            const packageName = route.params?.packageName;
            const title = packageName ? `Peta Lokasi - ${packageName}` : 'Peta Lokasi Paket';
            // "presentation: fullScreenModal" membuat layar peta terbuka
            // menutupi SELURUH layar (mirip membuka kamera), bukan sekadar
            // layar biasa di dalam stack — memberi ruang maksimal untuk
            // melihat & menandai peta tanpa gangguan navigasi lain.
            return {
              title,
              headerTitle: () => <ScreenHeaderTitle title={title} />,
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            };
          }}
        />
        <Stack.Screen
          name="WorkItemForm"
          component={WorkItemFormScreen}
          options={{ title: 'Form Item Pekerjaan', headerTitle: () => <ScreenHeaderTitle title="Form Item Pekerjaan" /> }}
        />
        <Stack.Screen name="Queue" component={QueueScreen} options={{ title: 'Antrian Survei', headerTitle: () => <ScreenHeaderTitle title="Antrian Survei" /> }} />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ title: 'Dashboard Admin', headerBackVisible: false, headerTitle: () => <ScreenHeaderTitle title="Dashboard Admin" /> }}
        />
        <Stack.Screen
          name="UserManagement"
          component={UserManagementScreen}
          options={{ title: 'Kelola Pengguna', headerTitle: () => <ScreenHeaderTitle title="Kelola Pengguna" /> }}
        />
        <Stack.Screen
          name="PackageData"
          component={PackageDataScreen}
          options={{ title: 'Data Paket', headerTitle: () => <ScreenHeaderTitle title="Data Paket" /> }}
        />
        <Stack.Screen
          name="PackageReport"
          component={PackageReportScreen}
          options={{ title: 'Laporan Tabel', headerTitle: () => <ScreenHeaderTitle title="Laporan Tabel" /> }}
        />
        <Stack.Screen
          name="AllPackagesReport"
          component={AllPackagesReportScreen}
          options={{ title: 'Laporan Semua Paket', headerTitle: () => <ScreenHeaderTitle title="Laporan Semua Paket" /> }}
        />
        <Stack.Screen
          name="EditItem"
          component={EditItemScreen}
          options={{ title: 'Edit Data', headerTitle: () => <ScreenHeaderTitle title="Edit Data" /> }}
        />
        <Stack.Screen
          name="InfraTypeManagement"
          component={InfraTypeManagementScreen}
          options={{ title: 'Jenis Infrastruktur', headerTitle: () => <ScreenHeaderTitle title="Jenis Infrastruktur" /> }}
        />
        <Stack.Screen
          name="PublicPackageList"
          component={PublicPackageListScreen}
          options={{ title: 'Data Publik', headerTitle: () => <ScreenHeaderTitle title="Data Publik" /> }}
        />
        <Stack.Screen
          name="PublicPackageData"
          component={PublicPackageDataScreen}
          options={{ title: 'Detail Data Publik', headerTitle: () => <ScreenHeaderTitle title="Detail Data Publik" /> }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



