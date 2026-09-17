import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import type { RootStackParamList } from './navigation';

export const linkingConfig: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'ua.transport.controller://'],
  config: {
    screens: {
      Login: 'login',
      Main: 'main',
      Scanner: 'scanner',
      TicketResult: 'ticket-result',
      ManualEntry: 'manual',
      RecordFine: 'fine/new',
      FineReceipt: 'fine/:fineId',
    },
  },
};
