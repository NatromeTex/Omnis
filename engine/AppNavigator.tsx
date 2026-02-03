/**
 * App Navigator
 * Main navigation component with screen transitions
 */

import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
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

type Screen = "home" | "chat" | "profile" | "settings";

interface ChatParams {
  chatId: number;
  withUser: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function MainNavigator() {
  const { auth, isLoading, isOnboardingComplete } = useApp();

  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [chatParams, setChatParams] = useState<ChatParams | null>(null);
  const [previousScreen, setPreviousScreen] = useState<Screen>("home");

  const translateX = useSharedValue(0);

  const homeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + SCREEN_WIDTH }],
  }));

  const animateToScreen = useCallback(
    (screen: Screen, direction: "left" | "right" = "left") => {
      const toValue = direction === "left" ? -SCREEN_WIDTH : 0;

      translateX.value = withTiming(
        toValue,
        {
          duration: 300,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        },
        () => {
          if (direction === "right") {
            runOnJS(setCurrentScreen)("home");
          }
        },
      );

      if (direction === "left") {
        setCurrentScreen(screen);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  const handleOpenChat = useCallback(
    (chatId: number, withUser: string) => {
      setChatParams({ chatId, withUser });
      setPreviousScreen("home");
      animateToScreen("chat", "left");
    },
    [animateToScreen],
  );

  const handleOpenSettings = useCallback(() => {
    setPreviousScreen("home");
    animateToScreen("settings", "left");
  }, [animateToScreen]);

  const handleOpenProfile = useCallback(() => {
    setPreviousScreen(currentScreen);
    animateToScreen("profile", "left");
  }, [animateToScreen, currentScreen]);

  const handleBack = useCallback(() => {
    animateToScreen(previousScreen, "right");
    setChatParams(null);
  }, [animateToScreen, previousScreen]);

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
      <View style={styles.container}>
        {/* Home Screen (Base layer) */}
        <Animated.View style={[styles.screen, homeStyle]}>
          <HomeScreen
            onOpenChat={handleOpenChat}
            onOpenSettings={handleOpenSettings}
          />
        </Animated.View>

        {/* Overlay Screen */}
        <Animated.View style={[styles.screen, styles.overlay, overlayStyle]}>
          {currentScreen === "chat" && chatParams && (
            <ChatScreen
              chatId={chatParams.chatId}
              withUser={chatParams.withUser}
              onBack={handleBack}
              onOpenProfile={handleOpenProfile}
            />
          )}
          {currentScreen === "settings" && (
            <SettingsScreen
              onBack={handleBack}
              onOpenProfile={handleOpenProfile}
            />
          )}
          {currentScreen === "profile" && <ProfileScreen onBack={handleBack} />}
        </Animated.View>
      </View>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
  },
  overlay: {
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
