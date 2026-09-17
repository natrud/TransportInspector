import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './navigation';

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'ua.transport.driver://'],
  config: {
    screens: {
      Login: 'login',
      Home: 'home',
      Settings: 'settings',
    },
  },
};
