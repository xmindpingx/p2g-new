// places2go — AmenityPicker
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// One-touch amenity chips grouped by section, each section collapsible.
// Reads the live amenity registry from the store (officialAmenities), so
// mod/admin-added amenities appear immediately, and deactivated ones vanish.
//
// Props
//   value      — { [amenityKey]: boolean }
//   onChange   — (nextValue) => void
//   compact    — true on Rate & Review: only the first N groups start expanded
//   onSuggest  — (group) => void; renders "Don't see it? Suggest one" per group

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { AMENITY_GROUP_ORDER, AMENITY_GROUP_LABELS } from '../constants/amenities';
import { Chip } from './FilterChips';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_EXPANDED_COUNT = 2;

export default function AmenityPicker({ value = {}, onChange, compact = false, onSuggest = null, style }) {
  const officialAmenities = useStore((s) => s.officialAmenities);

  const groups = useMemo(
    () =>
      AMENITY_GROUP_ORDER.map((group) => ({
        key:   group,
        label: AMENITY_GROUP_LABELS[group],
        items: officialAmenities.filter((a) => a.group === group && a.isActive),
      })).filter((g) => g.items.length > 0),
    [officialAmenities],
  );

  const [expanded, setExpanded] = useState(() => {
    const initial = {};
    groups.forEach((g, i) => { initial[g.key] = compact ? i < DEFAULT_EXPANDED_COUNT : i === 0; });
    return initial;
  });

  const toggleGroup = useCallback((key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleAmenity = useCallback(
    (key) => onChange({ ...value, [key]: !value[key] }),
    [value, onChange],
  );

  const selectedCount = useMemo(
    () => Object.values(value).filter(Boolean).length,
    [value],
  );

  return (
    <View style={style}>
      <Text style={styles.summary}>
        {selectedCount === 0 ? 'Tap everything that applies.' : `${selectedCount} selected`}
      </Text>

      {groups.map((group) => {
        const open  = expanded[group.key];
        const count = group.items.filter((a) => value[a.key]).length;
        return (
          <View key={group.key} style={styles.group}>
            <Pressable
              onPress={() => toggleGroup(group.key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={styles.groupHeader}
            >
              <Text style={styles.groupTitle}>{group.label}</Text>
              <View style={styles.groupRight}>
                {count > 0 ? (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                ) : null}
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textSecondary}
                />
              </View>
            </Pressable>

            {open ? (
              <View style={styles.chips}>
                {group.items.map((amenity) => (
                  <Chip
                    key={amenity.key}
                    label={amenity.label}
                    active={value[amenity.key] === true}
                    onPress={() => toggleAmenity(amenity.key)}
                  />
                ))}
                {onSuggest ? (
                  <Pressable
                    onPress={() => onSuggest(group.key)}
                    accessibilityRole="button"
                    style={styles.suggest}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.suggestText}>Don't see it? Suggest one</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    marginBottom:    spacing.sm,
    overflow:        'hidden',
  },
  groupHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
  },
  groupTitle: {
    ...typography.bodyMedium,
  },
  groupRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  countBadge: {
    minWidth:          22,
    height:            22,
    borderRadius:      radius.pill,
    backgroundColor:   colors.primary,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.xs + 2,
  },
  countText: {
    ...typography.badge,
    color: colors.textOnDark,
  },
  chips: {
    flexDirection:     'row',
    flexWrap:          'wrap',
    gap:               spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.lg,
  },
  suggest: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
    height:        36,
    paddingHorizontal: spacing.sm,
  },
  suggestText: {
    ...typography.caption,
  },
});
