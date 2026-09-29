// places2go — SearchBar
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// White rounded field with a leading search icon and a clear button when there
// is text. Matches the search field at the top of the Map and Results wireframes.

import React from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, spacing, radius, shadows } from '../theme';

export default function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search for a place...',
  autoFocus = false,
  editable = true,
  onFocus,
  onBlur,
  style,
  inputRef,
}) {
  return (
    <View style={[styles.container, style]}>
      <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.leadingIcon} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoFocus={autoFocus}
        editable={editable}
        onFocus={onFocus}
        onBlur={onBlur}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="never"
        style={styles.input}
        accessibilityLabel="Search"
      />
      {value?.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clearButton}
        >
          <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection:   'row',
    alignItems:      'center',
    height:          48,
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    paddingLeft:     spacing.md,
    paddingRight:    spacing.sm,
    ...shadows.card,
  },
  leadingIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex:       1,
    fontFamily: fonts.regular,
    fontSize:   fontSizes.md,
    color:      colors.textPrimary,
    paddingVertical: 0,
  },
  clearButton: {
    padding: spacing.xs,
  },
});
