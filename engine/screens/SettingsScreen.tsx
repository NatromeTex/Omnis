/**
 * Settings Screen
 * App settings and configuration
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Header, Input, SettingsItem } from "../components";
import { useApp } from "../context";
import { healthCheck } from "../services/api";
import { clearLogs, getLogText, subscribeLogs } from "../services/logging";
import { APP_VERSION } from "../constants";
import { Colors } from "../theme";

interface SettingsScreenProps {
  onBack: () => void;
  onOpenProfile: () => void;
}

const THEME_COLORS = [
  { name: "Cyan", value: "#96ACB7" },
  { name: "Blue", value: "#64B5F6" },
  { name: "Purple", value: "#BA68C8" },
  { name: "Pink", value: "#F06292" },
  { name: "Orange", value: "#FFB74D" },
  { name: "Green", value: "#81C784" },
  { name: "Teal", value: "#4DB6AC" },
  { name: "Red", value: "#E57373" },
];

export function SettingsScreen({ onBack, onOpenProfile }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const { auth, settings, setApiBaseUrl, setThemeColor } = useApp();

  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [urlInput, setUrlInput] = useState(settings.apiBaseUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [logText, setLogText] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "reachable" | "unreachable"
  >("idle");

  // Swipe right to go back
  const swipeGesture = Gesture.Pan()
    .activeOffsetX(50)
    .onEnd((event) => {
      if (event.translationX > 100) {
        runOnJS(handleBack)();
      }
    });

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setConnectionStatus("idle");
    try {
      await healthCheck();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setConnectionStatus("reachable");
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setConnectionStatus("unreachable");
    } finally {
      setIsTesting(false);
    }
  }, []);

  const handleSaveUrl = useCallback(async () => {
    // Validate URL format
    try {
      new URL(urlInput);
    } catch {
      Alert.alert(
        "Invalid URL",
        "Please enter a valid URL (e.g., http://localhost:8000)",
      );
      return;
    }

    // Remove trailing slash
    const cleanUrl = urlInput.replace(/\/$/, "");

    await setApiBaseUrl(cleanUrl);
    setShowUrlModal(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [urlInput, setApiBaseUrl]);

  const handleSelectColor = useCallback(
    async (color: string) => {
      await setThemeColor(color);
      setShowColorModal(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [setThemeColor],
  );

  const handleClearLogs = useCallback(() => {
    clearLogs();
  }, []);

  useEffect(() => {
    setLogText(getLogText());
    const unsubscribe = subscribeLogs(() => {
      setLogText(getLogText());
    });
    return unsubscribe;
  }, []);

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="Settings" showBack onBack={handleBack} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Account Section */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>

            <SettingsItem
              type="navigation"
              icon="person-outline"
              title="Profile"
              subtitle={auth.username || "View your profile"}
              onPress={onOpenProfile}
            />
          </Animated.View>

          {/* Appearance Section */}
          <Animated.View
            entering={FadeIn.delay(100).duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>Appearance</Text>

            <SettingsItem
              type="value"
              icon="color-palette-outline"
              title="Theme Color"
              value={
                THEME_COLORS.find((c) => c.value === settings.themeColor)
                  ?.name || "Custom"
              }
              onPress={() => setShowColorModal(true)}
              iconColor={settings.themeColor}
            />
          </Animated.View>

          {/* Server Section */}
          <Animated.View
            entering={FadeIn.delay(200).duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>Server</Text>

            <SettingsItem
              type="value"
              icon="server-outline"
              title="Backend URL"
              value={settings.apiBaseUrl}
              onPress={() => {
                setUrlInput(settings.apiBaseUrl);
                setShowUrlModal(true);
              }}
            />

            <SettingsItem
              type="value"
              icon="pulse-outline"
              title="Test Connection"
              value={
                isTesting
                  ? "Testing..."
                  : connectionStatus === "reachable"
                    ? "Reachable"
                    : connectionStatus === "unreachable"
                      ? "Not reachable"
                      : "Tap to test"
              }
              valueColor={
                connectionStatus === "reachable"
                  ? "#4CAF50"
                  : connectionStatus === "unreachable"
                    ? "#F44336"
                    : undefined
              }
              onPress={handleTestConnection}
            />
          </Animated.View>

          {/* About Section */}
          <Animated.View
            entering={FadeIn.delay(300).duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>About</Text>

            <SettingsItem
              type="value"
              icon="information-circle-outline"
              title="Version"
              value={APP_VERSION}
              onPress={() => {}}
            />
          </Animated.View>

          {/* Diagnostics Section */}
          <Animated.View
            entering={FadeIn.delay(400).duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>Diagnostics</Text>

            <SettingsItem
              type="navigation"
              icon="document-text-outline"
              title="Logs"
              subtitle="View app logs"
              onPress={() => setShowLogsModal(true)}
            />
          </Animated.View>
        </ScrollView>

        {/* URL Modal */}
        <Modal
          visible={showUrlModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUrlModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Backend URL</Text>
              <Text style={styles.modalSubtitle}>
                Enter the URL of your Omnis server
              </Text>

              <Input
                value={urlInput}
                onChangeText={setUrlInput}
                placeholder="http://localhost:8000"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                containerStyle={styles.modalInput}
              />

              <View style={styles.modalButtons}>
                <Button
                  title="Cancel"
                  onPress={() => setShowUrlModal(false)}
                  variant="ghost"
                  size="medium"
                  style={styles.modalButton}
                />
                <Button
                  title="Save"
                  onPress={handleSaveUrl}
                  variant="primary"
                  size="medium"
                  loading={isTesting}
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>

        {/* Color Picker Modal */}
        <Modal
          visible={showColorModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowColorModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Theme Color</Text>
              <Text style={styles.modalSubtitle}>Choose your accent color</Text>

              <View style={styles.colorGrid}>
                {THEME_COLORS.map((color) => (
                  <Pressable
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.value },
                      settings.themeColor === color.value &&
                        styles.colorOptionSelected,
                    ]}
                    onPress={() => handleSelectColor(color.value)}
                  >
                    {settings.themeColor === color.value && (
                      <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                    )}
                  </Pressable>
                ))}
              </View>

              <Button
                title="Cancel"
                onPress={() => setShowColorModal(false)}
                variant="ghost"
                size="medium"
              />
            </View>
          </View>
        </Modal>

        {/* Logs Modal */}
        <Modal
          visible={showLogsModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLogsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, styles.logsModalContent]}>
              <Text style={styles.modalTitle}>Logs</Text>
              <Text style={styles.modalSubtitle}>
                Live app logs (most recent at bottom)
              </Text>

              <View style={styles.logsContainer}>
                <ScrollView
                  contentContainerStyle={styles.logsContent}
                  showsVerticalScrollIndicator
                >
                  <Text style={styles.logsText} selectable>
                    {logText || "No logs yet."}
                  </Text>
                </ScrollView>
              </View>

              <View style={styles.modalButtons}>
                <Button
                  title="Clear"
                  onPress={handleClearLogs}
                  variant="ghost"
                  size="medium"
                  style={styles.modalButton}
                />
                <Button
                  title="Close"
                  onPress={() => setShowLogsModal(false)}
                  variant="primary"
                  size="medium"
                  style={styles.modalButton}
                />
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textMuted,
    marginBottom: 12,
    marginLeft: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
  },
  logsModalContent: {
    maxWidth: 400,
    height: "80%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 24,
    textAlign: "center",
  },
  modalInput: {
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  logsContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  logsContent: {
    paddingBottom: 12,
  },
  logsText: {
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: "monospace",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    marginBottom: 24,
  },
  colorOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: Colors.textPrimary,
  },
});
