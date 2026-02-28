/**
 * SearchBar Component
 * Search input with add button functionality and user autocomplete
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { Colors } from "../theme";

interface UserSuggestion {
  id: number;
  username: string;
}

interface SearchBarProps {
  onSearch: (query: string) => void;
  onAddUser: (username: string) => void;
  onAddModeQueryChange?: (query: string) => void;
  userSuggestions?: UserSuggestion[];
  placeholder?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SearchBar({
  onSearch,
  onAddUser,
  onAddModeQueryChange,
  userSuggestions = [],
  placeholder = "Search chats",
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isAddMode, setIsAddMode] = useState(false);
  const modeProgress = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: buttonScale.value },
      { rotate: `${interpolate(modeProgress.value, [0, 1], [0, 45])}deg` },
    ],
  }));

  const handlePressIn = () => {
    buttonScale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const toggleMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode = !isAddMode;
    setIsAddMode(newMode);
    modeProgress.value = withTiming(newMode ? 1 : 0, { duration: 200 });
    setQuery("");
    if (!newMode) {
      onAddModeQueryChange?.("");
    }
  };

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (isAddMode) {
      onAddModeQueryChange?.(text);
    } else {
      onSearch(text);
    }
  };

  const handleSubmit = () => {
    if (isAddMode && query.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onAddUser(query.trim());
      setQuery("");
      onAddModeQueryChange?.("");
      toggleMode();
    }
  };

  const handleSelectSuggestion = (username: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAddUser(username);
    setQuery("");
    onAddModeQueryChange?.("");
    toggleMode();
  };

  const showSuggestions = isAddMode && userSuggestions.length > 0 && query.trim().length > 0;

  return (
    <View style={styles.wrapper}>
      {showSuggestions && (
        <View style={styles.suggestionsContainer}>
          <FlatList
            data={userSuggestions}
            keyExtractor={(item) => item.id.toString()}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(item.username)}
              >
                <View style={styles.suggestionAvatar}>
                  <Ionicons name="person" size={16} color={Colors.accent} />
                </View>
                <Text style={styles.suggestionText}>{item.username}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
      <View style={styles.container}>
      <View style={styles.inputContainer}>
        <Ionicons
          name={isAddMode ? "person-add-outline" : "search-outline"}
          size={20}
          color={Colors.textMuted}
          style={styles.icon}
        />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleChangeText}
          placeholder={isAddMode ? "Enter username" : placeholder}
          placeholderTextColor={Colors.textMuted}
          selectionColor={Colors.accent}
          returnKeyType={isAddMode ? "done" : "search"}
          onSubmitEditing={handleSubmit}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => {
              setQuery("");
              if (!isAddMode) onSearch("");
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <AnimatedPressable
        style={[
          styles.addButton,
          isAddMode && styles.addButtonActive,
          buttonAnimatedStyle,
        ]}
        onPress={toggleMode}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Ionicons
          name="add"
          size={24}
          color={isAddMode ? Colors.background : Colors.accent}
        />
      </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.background,
  },
  suggestionsContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: 280,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionText: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonActive: {
    backgroundColor: Colors.accent,
  },
});
