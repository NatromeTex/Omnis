/**
 * Home Screen
 * Main screen with chat list
 */

import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChatListItem, SearchBar } from "../components";
import { useApp, useChat } from "../context";
import { searchUsers } from "../services/api";
import { Colors } from "../theme";
import type { LocalChat, RootStackParamList } from "../types";

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Home">>();
  const insets = useSafeAreaInsets();
  const { auth } = useApp();
  const {
    chats,
    isLoadingChats,
    loadChats,
    syncChats,
    searchChats,
    createChat,
  } = useChat();

  const [userSuggestions, setUserSuggestions] = useState<
    { id: number; username: string }[]
  >([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const handleAddModeQueryChange = useCallback((query: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setUserSuggestions([]);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      try {
        const results = await searchUsers(trimmed);
        setUserSuggestions(results);
      } catch {
        setUserSuggestions([]);
      }
    }, 400);
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      loadChats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  const handleSearch = useCallback(
    (query: string) => {
      searchChats(query);
    },
    [searchChats],
  );

  const handleOpenChat = useCallback(
    (chatId: number, withUser: string) => {
      navigation.navigate("Chat", { chatId, withUser });
    },
    [navigation],
  );

  const handleAddUser = useCallback(
    async (username: string) => {
      if (username.toLowerCase() === auth.username?.toLowerCase()) {
        Alert.alert("Error", "You can't start a chat with yourself");
        return;
      }

      try {
        const chatId = await createChat(username);
        handleOpenChat(chatId, username);
      } catch (error: any) {
        Alert.alert("Error", error.message || "Failed to create chat");
      }
    },
    [createChat, handleOpenChat, auth.username],
  );

  const handleRefresh = useCallback(() => {
    syncChats();
  }, [syncChats]);

  const handleSettingsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("Settings");
  };

  const renderItem = useCallback(
    ({ item, index }: { item: LocalChat; index: number }) => (
      <ChatListItem
        name={item.with_user}
        lastMessage={item.last_message}
        lastMessageTime={item.last_message_time}
        unreadCount={item.unread_count}
        onPress={() => handleOpenChat(item.chat_id, item.with_user)}
        index={index}
      />
    ),
    [handleOpenChat],
  );

  const renderEmpty = () => (
    <Animated.View
      entering={FadeIn.delay(300).duration(500)}
      style={styles.emptyContainer}
    >
      <Ionicons name="chatbubbles-outline" size={64} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No Chats Yet</Text>
      <Text style={styles.emptySubtitle}>
        Start a new conversation by tapping the + button below
      </Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Pressable onPress={handleSettingsPress} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={Colors.accent} />
        </Pressable>
      </View>

      {/* Chat List */}
      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={(item) => item.chat_id.toString()}
        contentContainerStyle={[
          styles.listContent,
          chats.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingChats}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Search Bar */}
      <View style={{ paddingBottom: insets.bottom }}>
        <SearchBar
          onSearch={handleSearch}
          onAddUser={handleAddUser}
          onAddModeQueryChange={handleAddModeQueryChange}
          userSuggestions={userSuggestions}
          placeholder="Search chats"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    flexGrow: 1,
  },
  listContentEmpty: {
    justifyContent: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
});
