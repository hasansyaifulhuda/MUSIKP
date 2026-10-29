import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.musicfy.app',
  appName: 'MusicFY',
  webDir: 'out',
  server: {
    url: 'https://shanz.my.id',
    cleartext: true
  }
};

export default config;
