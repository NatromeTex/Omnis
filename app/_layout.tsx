/**
 * Omnis App Root Layout
 */

import 'react-native-get-random-values';
import { TextEncoder, TextDecoder } from 'text-encoding';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

import { AppNavigator } from "@/engine";
import "react-native-reanimated";
import "../global.css";

export default function RootLayout() {
  return <AppNavigator />;
}
