import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aiom.ios',
  appName: 'All in One mods',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor'
  },
  ios: {
    preferredContentMode: 'mobile'
  }
};

export default config;
