module.exports = ({ config }) => ({
  ...config,
  name: 'SurveiPSU',
  slug: 'mobile-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    supportsTablet: true,
  },
  android: {
    package: 'com.appsurvei.mobileapp',
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: './assets/favicon.png',
    bundler: 'metro',
    output: 'single',
  },
  plugins: ['expo-sharing'],
  extra: {
    eas: {
      projectId: '58b3db1a-ff44-4b0e-a9f4-815a56799738',
    },
    gasUrl: process.env.GAS_WEB_APP_URL ?? '',
    maptilerKey: process.env.MAPTILER_API_KEY ?? '',
    cartoKey: process.env.CARTO_API_KEY ?? '',
  },
});
