import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import LoginScreen from '../LoginScreen';
import * as authService from '../../services/authService';

// authService memanggil AsyncStorage/fetch sungguhan; untuk test render UI
// ini kita mock seluruh modulnya supaya perilaku login/getCurrentUser bisa
// dikendalikan langsung per skenario.
jest.mock('../../services/authService');

const mockedAuthService = authService as jest.Mocked<typeof authService>;

afterEach(cleanup);

async function renderLoginScreen() {
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
  } as any;
  await render(<LoginScreen navigation={navigation} route={{} as any} />);
  return { navigation };
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockedAuthService.getCurrentUser.mockResolvedValue(null);
  });

  it('menampilkan form login setelah selesai memeriksa sesi tersimpan', async () => {
    await renderLoginScreen();

    expect(await screen.findByPlaceholderText('Username')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
    expect(screen.getByText('Masuk')).toBeTruthy();
  });

  it('tombol Masuk nonaktif saat username/password masih kosong', async () => {
    await renderLoginScreen();
    await screen.findByPlaceholderText('Username');

    const button = screen.getByText('Masuk').parent;
    expect(button?.props.accessibilityState?.disabled).toBe(true);
  });

  it('memanggil login lalu berpindah ke PackageList saat berhasil sebagai surveyor', async () => {
    mockedAuthService.login.mockResolvedValue({
      name: 'Budi',
      role: 'surveyor',
      sessionToken: 'token-123',
    } as any);

    const { navigation } = await renderLoginScreen();
    await screen.findByPlaceholderText('Username');

    await fireEvent.changeText(screen.getByPlaceholderText('Username'), 'budi');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'rahasia');
    await fireEvent.press(screen.getByText('Masuk'));

    await waitFor(() => {
      expect(mockedAuthService.login).toHaveBeenCalledWith('budi', 'rahasia');
      expect(navigation.replace).toHaveBeenCalledWith('PackageList', { surveyorName: 'Budi' });
    });
  });

  it('berpindah ke AdminDashboard saat login berhasil sebagai admin', async () => {
    mockedAuthService.login.mockResolvedValue({
      name: 'Admin',
      role: 'admin',
      sessionToken: 'token-abc',
    } as any);

    const { navigation } = await renderLoginScreen();
    await screen.findByPlaceholderText('Username');

    await fireEvent.changeText(screen.getByPlaceholderText('Username'), 'admin');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'admin123');
    await fireEvent.press(screen.getByText('Masuk'));

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('AdminDashboard');
    });
  });

  it('menampilkan alert saat login gagal (username/password salah)', async () => {
    const { Alert } = require('../../utils/alert');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedAuthService.login.mockRejectedValue(new Error('Username atau password salah.'));

    await renderLoginScreen();
    await screen.findByPlaceholderText('Username');

    await fireEvent.changeText(screen.getByPlaceholderText('Username'), 'salah');
    await fireEvent.changeText(screen.getByPlaceholderText('Password'), 'salah');
    await fireEvent.press(screen.getByText('Masuk'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Gagal Masuk', 'Username atau password salah.');
    });

    alertSpy.mockRestore();
  });

  it('langsung berpindah ke layar sesuai role saat sudah ada sesi tersimpan', async () => {
    mockedAuthService.getCurrentUser.mockResolvedValue({
      name: 'Viewer',
      role: 'viewer',
      sessionToken: 'existing-token',
    } as any);

    const { navigation } = await renderLoginScreen();

    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith('PublicPackageList');
    });
  });
});
