/**
 * App Navigator
 * Main navigation component using React Navigation native stack
 */

import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, ChatProvider, useApp } from "./context";
import {
    ChatScreen,
    HomeScreen,
    OnboardingScreen,
    ProfileScreen,
    SettingsScreen,
} from "./screens";
import { initLogCapture } from "./services/logging";
import { Colors } from "./theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainNavigator() {
  const { auth, isLoading, isOnboardingComplete } = useApp();

  // Show loading screen
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
      </View>
    );
  }

  // Show onboarding if not authenticated or onboarding not complete
  if (!auth.isAuthenticated || !isOnboardingComplete) {
    return (
      <>
        <StatusBar style="light" />
        <OnboardingScreen />
      </>
    );
  }

  // Main app
  return (
    <ChatProvider>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </ChatProvider>
  );
}

export function AppNavigator() {
  useEffect(() => {
    initLogCapture();
  }, []);

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaProvider>
        <AppProvider>
          <MainNavigator />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
