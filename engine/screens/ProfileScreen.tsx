/**
 * Profile Screen
 * User profile and session management
 */

import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, Header, SessionItem } from "../components";
import { useApp } from "../context";
import {
    getSessions,
    revokeOtherSessions,
    revokeSession,
} from "../services/api";
import { Colors } from "../theme";
import type { RootStackParamList, Session } from "../types";

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Profile">>();
  const insets = useSafeAreaInsets();
  const { auth, logout } = useApp();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
    navigation.goBack();
  };

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevokeSession = useCallback(
    async (sessionId: number) => {
      Alert.alert(
        "Revoke Session",
        "Are you sure you want to revoke this session?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: async () => {
              try {
                await revokeSession(sessionId);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                loadSessions();
              } catch (error: any) {
                Alert.alert(
                  "Error",
                  error.message || "Failed to revoke session",
                );
              }
            },
          },
        ],
      );
    },
    [loadSessions],
  );

  const handleRevokeOthers = useCallback(async () => {
    Alert.alert(
      "Revoke All Other Sessions",
      "This will log you out of all other devices. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke All",
          style: "destructive",
          onPress: async () => {
            try {
              await revokeOtherSessions();
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              loadSessions();
            } catch (error: any) {
              Alert.alert(
                "Error",
                error.message || "Failed to revoke sessions",
              );
            }
          },
        },
      ],
    );
  }, [loadSessions]);

  const handleLogout = useCallback(async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await logout();
        },
      },
    ]);
  }, [logout]);

  const currentSession = sessions.find((s) => s.current);
  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="Profile" showBack onBack={handleBack} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={loadSessions}
              tintColor={Colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* User Info */}
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.userSection}
          >
            <Avatar name={auth.username || "U"} size={80} />
            <Text style={styles.username}>{auth.username}</Text>
            <Text style={styles.userId}>ID: {auth.userId}</Text>
          </Animated.View>

          {/* Current Session */}
          <Animated.View
            entering={FadeIn.delay(100).duration(300)}
            style={styles.section}
          >
            <Text style={styles.sectionTitle}>Current Session</Text>
            {currentSession && (
              <SessionItem session={currentSession} onRevoke={() => {}} />
            )}
          </Animated.View>

          {/* Other Sessions */}
          <Animated.View
            entering={FadeIn.delay(200).duration(300)}
            style={styles.section}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Other Sessions</Text>
              {otherSessions.length > 0 && (
                <Button
                  title="Revoke All"
                  onPress={handleRevokeOthers}
                  variant="ghost"
                  size="small"
                />
              )}
            </View>

            {otherSessions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={32}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyText}>No other active sessions</Text>
              </View>
            ) : (
              otherSessions.map((session, index) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  onRevoke={handleRevokeSession}
                  index={index}
                />
              ))
            )}
          </Animated.View>

          {/* Logout */}
          <Animated.View
            entering={FadeIn.delay(300).duration(300)}
            style={styles.logoutSection}
          >
            <Button
              title="Log Out"
              onPress={handleLogout}
              variant="outline"
              size="large"
              style={styles.logoutButton}
              textStyle={styles.logoutButtonText}
            />
          </Animated.View>
        </ScrollView>
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
  userSection: {
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 24,
  },
  username: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginTop: 16,
  },
  userId: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: "center",
    padding: 24,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  logoutSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logoutButton: {
    borderColor: Colors.error,
  },
  logoutButtonText: {
    color: Colors.error,
  },
});
