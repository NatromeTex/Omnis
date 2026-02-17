/**
 * MessageBubble Component
 * Individual message bubble in chat
 */

import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { findPhoneNumbersInText } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import { Colors } from "../theme";
import { ReplyPreview } from "./ReplyPreview";

interface TextPart {
  text: string;
  linkType: "phone" | "email" | null;
  linkValue: string | null;
}

interface LinkSpan {
  start: number;
  end: number;
  linkType: "phone" | "email";
  linkValue: string;
}

function getDefaultCountryFromLocale(): CountryCode | undefined {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale.match(/(?:-|_)([A-Za-z]{2})\b/)?.[1]?.toUpperCase();
  if (!region) {
    return undefined;
  }

  return region as CountryCode;
}

function isLikelyPhoneMatch(rawMatch: string, e164: string): boolean {
  const digitCount = (rawMatch.match(/\d/g) ?? []).length;
  const isContinuousDigitsOnly = /^\d+$/.test(rawMatch);
  const hasFormatting = /[\s().-]/.test(rawMatch);

  if (/[A-Za-z]/.test(rawMatch)) {
    return false;
  }

  if (/\d[/.]\d/.test(rawMatch)) {
    return false;
  }

  if (isContinuousDigitsOnly && (digitCount < 10 || digitCount > 11)) {
    return false;
  }

  if (!rawMatch.trim().startsWith("+") && !hasFormatting && digitCount < 10) {
    return false;
  }

  const e164Digits = e164.replace(/\D/g, "").length;
  return e164Digits >= 8 && e164Digits <= 15;
}

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  isSent: boolean;
  index?: number;
  /** Text of the replied-to message */
  replyText?: string | null;
  /** Sender name of the replied-to message */
  replySender?: string | null;
  /** Callback when the reply preview is tapped */
  onReplyPress?: () => void;
}

export function MessageBubble({
  message,
  timestamp,
  isSent,
  index = 0,
  replyText,
  replySender,
  onReplyPress,
}: MessageBubbleProps) {
  const defaultCountry = React.useMemo(getDefaultCountryFromLocale, []);

  const messageParts = React.useMemo(() => {
    const parts: TextPart[] = [];
    const linkSpans: LinkSpan[] = [];
    const matches = findPhoneNumbersInText(message, {
      defaultCountry,
      defaultCallingCode: undefined,
    });

    for (const match of matches) {
      const rawMatch = message.slice(match.startsAt, match.endsAt);

      if (!match.number.isValid()) {
        continue;
      }

      if (!isLikelyPhoneMatch(rawMatch, match.number.number)) {
        continue;
      }

      linkSpans.push({
        start: match.startsAt,
        end: match.endsAt,
        linkType: "phone",
        linkValue: match.number.number,
      });
    }

    const continuousDigitsRegex = /\d{9,}/g;
    let regexMatch = continuousDigitsRegex.exec(message);

    while (regexMatch) {
      const rawDigits = regexMatch[0];
      const start = regexMatch.index;
      const end = start + rawDigits.length;
      const overlapsExisting = linkSpans.some(
        (span) => start < span.end && end > span.start,
      );

      if (!overlapsExisting) {
        linkSpans.push({
          start,
          end,
          linkType: "phone",
          linkValue: rawDigits,
        });
      }

      regexMatch = continuousDigitsRegex.exec(message);
    }

    const emailRegex = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
    let emailMatch = emailRegex.exec(message);

    while (emailMatch) {
      const rawEmail = emailMatch[0];
      const start = emailMatch.index;
      const end = start + rawEmail.length;
      const overlapsExisting = linkSpans.some(
        (span) => start < span.end && end > span.start,
      );

      if (!overlapsExisting) {
        linkSpans.push({
          start,
          end,
          linkType: "email",
          linkValue: rawEmail,
        });
      }

      emailMatch = emailRegex.exec(message);
    }

    linkSpans.sort((left, right) => left.start - right.start);

    let cursor = 0;

    for (const span of linkSpans) {
      if (span.start < cursor) {
        continue;
      }

      if (span.start > cursor) {
        parts.push({ text: message.slice(cursor, span.start), linkType: null, linkValue: null });
      }

      parts.push({
        text: message.slice(span.start, span.end),
        linkType: span.linkType,
        linkValue: span.linkValue,
      });
      cursor = span.end;
    }

    if (cursor < message.length) {
      parts.push({ text: message.slice(cursor), linkType: null, linkValue: null });
    }

    return parts.length > 0 ? parts : [{ text: message, linkType: null, linkValue: null }];
  }, [message, defaultCountry]);

  const handlePhonePress = React.useCallback((phoneNumber: string) => {
    void Linking.openURL(`tel:${phoneNumber}`);
  }, []);

  const handleEmailPress = React.useCallback((email: string) => {
    void Linking.openURL(`mailto:${email}`);
  }, []);

  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 30).duration(200)}
      style={[
        styles.container,
        isSent ? styles.containerSent : styles.containerReceived,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSent ? styles.bubbleSent : styles.bubbleReceived,
        ]}
      >
        {replyText ? (
          <ReplyPreview
            replyText={replyText}
            replySender={replySender ?? undefined}
            isSent={isSent}
            onPress={onReplyPress}
          />
        ) : null}
        <Text style={styles.message}>
          {messageParts.map((part, partIndex) => {
            if (!part.linkType || !part.linkValue) {
              return <Text key={`text-${partIndex}`}>{part.text}</Text>;
            }

            const linkValue = part.linkValue;

            const onPress =
              part.linkType === "phone"
                ? () => handlePhonePress(linkValue)
                : () => handleEmailPress(linkValue);

            return (
              <Text
                key={`${part.linkType}-${partIndex}`}
                style={styles.linkText}
                accessibilityRole="link"
                onPress={onPress}
              >
                {part.text}
              </Text>
            );
          })}
        </Text>
        <Text style={styles.timestamp}>{formatTime(timestamp)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    maxWidth: "80%",
  },
  containerSent: {
    alignSelf: "flex-end",
  },
  containerReceived: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
  },
  bubbleSent: {
    backgroundColor: Colors.messageSent,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: Colors.messageReceived,
    borderBottomLeftRadius: 4,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  linkText: {
    color: Colors.accent,
    textDecorationLine: "underline",
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
});
