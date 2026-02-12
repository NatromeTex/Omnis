/**
 * Onboarding Screen
 * Welcome screen with signup/login options
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
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    FadeOut,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Input } from "../components";
import { useApp } from "../context";
import { healthCheck } from "../services/api";
import { Colors } from "../theme";

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

const LOADING_PHRASES = [
  "Handshaking with TLS...",
  "Asking nicely for permissions...",
  "Bribing the firewall...",
];

const LOGIN_PHRASES = [
  "Decrypting your vault...",
  "Waking up the server...",
  "Verifying your existence...",
  "Checking if you're a robot...",
  "Finding your keys...",
];

type AuthMode = "welcome" | "login" | "signup";

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const {
    signup,
    login,
    completeOnboarding,
    settings,
    setApiBaseUrl,
    setThemeColor,
  } = useApp();

  const [mode, setMode] = useState<AuthMode>("welcome");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Settings modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [urlInput, setUrlInput] = useState(settings.apiBaseUrl);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "reachable" | "unreachable"
  >("idle");
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);

  // Rotate loading phrases while loading
  useEffect(() => {
    if (!isLoading) {
      setLoadingPhrase("");
      setPhraseIndex(0);
      return;
    }

    const phrases = mode === "signup" ? LOADING_PHRASES : LOGIN_PHRASES;
    setLoadingPhrase(phrases[0]);

    const interval = setInterval(() => {
      setPhraseIndex((prev) => {
        const next = (prev + 1) % phrases.length;
        setLoadingPhrase(phrases[next]);
        return next;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isLoading, mode]);

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
    try {
      new URL(urlInput);
    } catch {
      Alert.alert(
        "Invalid URL",
        "Please enter a valid URL (e.g., http://localhost:8000)",
      );
      return;
    }

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

  const handleSignup = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await signup(username.trim(), password);
      Alert.alert(
        "Account Created",
        "Your account has been created successfully. Please log in.",
        [{ text: "OK", onPress: () => setMode("login") }],
      );
      setPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      setError(e.message || "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await login(username.trim(), password);
      await completeOnboarding();
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const renderWelcome = () => (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={styles.welcomeContainer}
    >
      {/* Settings Button */}
      <Animated.View
        entering={FadeIn.delay(600).duration(300)}
        style={styles.settingsButtonContainer}
      >
        <Pressable
          style={styles.settingsButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSettingsModal(true);
          }}
        >
          <Ionicons
            name="settings-outline"
            size={24}
            color={Colors.textSecondary}
          />
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(500)}
        style={styles.logoContainer}
      >
        <View style={styles.logoWrapper}>
          <Text style={styles.logo}>Ω</Text>
        </View>
        <Text style={styles.appName}>Omnis</Text>
        <Text style={styles.tagline}>Secure messaging, simplified.</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInUp.delay(400).duration(500)}
        style={styles.buttonContainer}
      >
        <Button
          title="Create Account"
          onPress={() => setMode("signup")}
          variant="primary"
          size="large"
          style={styles.button}
        />
        <Button
          title="Sign In"
          onPress={() => setMode("login")}
          variant="outline"
          size="large"
          style={styles.button}
        />
      </Animated.View>
    </Animated.View>
  );

  const renderAuth = () => (
    <View style={styles.authContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(300)}>
          <Text style={styles.authTitle}>
            {mode === "signup" ? "Create Account" : "Welcome Back"}
          </Text>
          <Text style={styles.authSubtitle}>
            {mode === "signup"
              ? "Sign up to start messaging securely"
              : "Sign in to your account"}
          </Text>

          <View style={styles.form}>
            <Input
              label="Username"
              placeholder="Enter your username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.input}
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              containerStyle={styles.input}
            />

            {mode === "signup" && (
              <Input
                label="Confirm Password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                containerStyle={styles.input}
              />
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {isLoading ? (
              <View style={styles.loadingContainer}>
                <Button
                  title=""
                  onPress={() => {}}
                  variant="primary"
                  size="large"
                  loading={true}
                  disabled={true}
                  style={styles.submitButton}
                />
                <Animated.Text
                  key={phraseIndex}
                  entering={FadeIn.duration(300)}
                  exiting={FadeOut.duration(200)}
                  style={styles.loadingPhrase}
                >
                  {loadingPhrase}
                </Animated.Text>
              </View>
            ) : (
              <Button
                title={mode === "signup" ? "Create Account" : "Sign In"}
                onPress={mode === "signup" ? handleSignup : handleLogin}
                variant="primary"
                size="large"
                style={styles.submitButton}
              />
            )}

            <Button
              title={
                mode === "signup"
                  ? "Already have an account?"
                  : "Don't have an account?"
              }
              onPress={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
              }}
              variant="ghost"
              size="medium"
            />

            <Button
              title="Back"
              onPress={() => {
                setMode("welcome");
                setError("");
                setUsername("");
                setPassword("");
                setConfirmPassword("");
              }}
              variant="ghost"
              size="small"
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {mode === "welcome" ? renderWelcome() : renderAuth()}

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Text style={styles.modalSubtitle}>
              Configure your app before signing in
            </Text>

            <View style={styles.settingsList}>
              <Pressable
                style={styles.settingsListItem}
                onPress={() => {
                  setUrlInput(settings.apiBaseUrl);
                  setShowSettingsModal(false);
                  setShowUrlModal(true);
                }}
              >
                <View style={styles.settingsListItemLeft}>
                  <Ionicons
                    name="server-outline"
                    size={22}
                    color={Colors.accent}
                  />
                  <View style={styles.settingsListItemText}>
                    <Text style={styles.settingsListItemTitle}>
                      Backend URL
                    </Text>
                    <Text
                      style={styles.settingsListItemValue}
                      numberOfLines={1}
                    >
                      {settings.apiBaseUrl}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={Colors.textSecondary}
                />
              </Pressable>

              <Pressable
                style={styles.settingsListItem}
                onPress={handleTestConnection}
                disabled={isTesting}
              >
                <View style={styles.settingsListItemLeft}>
                  <Ionicons
                    name="pulse-outline"
                    size={22}
                    color={Colors.accent}
                  />
                  <View style={styles.settingsListItemText}>
                    <Text style={styles.settingsListItemTitle}>
                      Test Connection
                    </Text>
                    <Text
                      style={[
                        styles.settingsListItemValue,
                        connectionStatus === "reachable" && {
                          color: "#4CAF50",
                          fontWeight: "600",
                        },
                        connectionStatus === "unreachable" && {
                          color: "#F44336",
                          fontWeight: "600",
                        },
                      ]}
                    >
                      {isTesting
                        ? "Testing..."
                        : connectionStatus === "reachable"
                          ? "Reachable"
                          : connectionStatus === "unreachable"
                            ? "Not reachable"
                            : "Tap to test"}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable
                style={styles.settingsListItem}
                onPress={() => {
                  setShowSettingsModal(false);
                  setShowColorModal(true);
                }}
              >
                <View style={styles.settingsListItemLeft}>
                  <Ionicons
                    name="color-palette-outline"
                    size={22}
                    color={settings.themeColor}
                  />
                  <View style={styles.settingsListItemText}>
                    <Text style={styles.settingsListItemTitle}>
                      Theme Color
                    </Text>
                    <Text style={styles.settingsListItemValue}>
                      {THEME_COLORS.find((c) => c.value === settings.themeColor)
                        ?.name || "Custom"}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={Colors.textSecondary}
                />
              </Pressable>
            </View>

            <Button
              title="Done"
              onPress={() => setShowSettingsModal(false)}
              variant="primary"
              size="medium"
              style={styles.modalDoneButton}
            />
          </View>
        </View>
      </Modal>

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
                onPress={() => {
                  setShowUrlModal(false);
                  setShowSettingsModal(true);
                }}
                variant="ghost"
                size="medium"
                style={styles.modalButton}
              />
              <Button
                title="Save"
                onPress={handleSaveUrl}
                variant="primary"
                size="medium"
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
              title="Done"
              onPress={() => {
                setShowColorModal(false);
                setShowSettingsModal(true);
              }}
              variant="ghost"
              size="medium"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: "space-between",
    padding: 24,
  },
  settingsButtonContainer: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoWrapper: {
    width: 140,
    height: 140,
    borderRadius: 28,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  logo: {
    fontSize: 100,
    color: Colors.accent,
    fontWeight: "200",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  appName: {
    fontSize: 48,
    color: Colors.textPrimary,
    fontWeight: "700",
    marginTop: 16,
  },
  tagline: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  buttonContainer: {
    gap: 12,
    paddingBottom: 24,
  },
  button: {
    width: "100%",
  },
  authContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
  authTitle: {
    fontSize: 32,
    color: Colors.textPrimary,
    fontWeight: "700",
    marginBottom: 8,
  },
  authSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 32,
  },
  form: {
    gap: 16,
  },
  input: {
    marginBottom: 8,
  },
  error: {
    color: Colors.error,
    fontSize: 14,
    textAlign: "center",
  },
  loadingContainer: {
    alignItems: "center",
  },
  loadingPhrase: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
    minHeight: 18,
  },
  submitButton: {
    marginTop: 16,
    width: "100%",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
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
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
  },
  modalDoneButton: {
    marginTop: 8,
  },
  settingsList: {
    marginBottom: 16,
  },
  settingsListItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingsListItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingsListItemText: {
    marginLeft: 12,
    flex: 1,
  },
  settingsListItemTitle: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  settingsListItemValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    marginBottom: 24,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
});
