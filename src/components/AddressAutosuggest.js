// places2go — AddressAutosuggest
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Search field with a debounced Nominatim dropdown. Selecting a result gives
// the caller { name, formattedAddress, latitude, longitude }.
//
// Debounce is 600 ms and the service throttles to 1 req/s, so fast typing
// produces at most one request per pause — well within the OSM policy.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radius, shadows } from '../theme';
import { searchAddress } from '../services/nominatim';
import SearchBar from './SearchBar';

const DEBOUNCE_MS = 600;
const MIN_CHARS   = 3;

export default function AddressAutosuggest({ value, onChangeText, onSelect, near = null, placeholder = 'Search or enter address', style }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [open, setOpen]       = useState(false);
  const abortRef              = useRef(null);
  const suppressRef           = useRef(false); // skip the fetch right after a selection

  useEffect(() => {
    if (suppressRef.current) { suppressRef.current = false; return; }

    const q = (value || '').trim();
    if (q.length < MIN_CHARS) {
      setResults([]); setError(null); setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true); setError(null);
      try {
        const found = await searchAddress(q, { limit: 5, near, signal: controller.signal });
        if (!controller.signal.aborted) { setResults(found); setOpen(true); }
      } catch (err) {
        if (!controller.signal.aborted) { setResults([]); setError('Address lookup failed'); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, near]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const select = (result) => {
    suppressRef.current = true;
    abortRef.current?.abort();
    setOpen(false); setResults([]); setLoading(false);
    onSelect(result);
  };

  const showDropdown = open && (results.length > 0 || loading || error);

  return (
    <View style={style}>
      <SearchBar
        value={value}
        onChangeText={(t) => { onChangeText(t); setOpen(true); }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
      />

      {showDropdown ? (
        <View style={styles.dropdown}>
          {loading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.textSecondary} />
              <Text style={styles.statusText}>Searching OpenStreetMap…</Text>
            </View>
          ) : null}
          {error ? <Text style={[styles.statusText, styles.errorText]}>{error}</Text> : null}
          {results.map((r, index) => (
            <Pressable
              key={r.id}
              onPress={() => select(r)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.row,
                index < results.length - 1 && styles.rowBorder,
                pressed && styles.rowPressed,
              ]}
            >
              <Ionicons name="location-outline" size={18} color={colors.textSecondary} style={styles.rowIcon} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {r.name || r.formattedAddress || r.displayName}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={2}>
                  {r.name ? r.formattedAddress || r.displayName : r.displayName}
                </Text>
              </View>
            </Pressable>
          ))}
          <Text style={styles.attribution}>© OpenStreetMap contributors</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    marginTop:       spacing.xs,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    overflow:        'hidden',
    ...shadows.card,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    padding:       spacing.md,
  },
  statusText: {
    ...typography.caption,
  },
  errorText: {
    padding: spacing.md,
    color:   colors.primary,
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm + 2,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowPressed: {
    backgroundColor: colors.background,
  },
  rowIcon: {
    marginRight: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...typography.bodyMedium,
  },
  rowSubtitle: {
    ...typography.caption,
  },
  attribution: {
    ...typography.label,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs + 2,
    textAlign:         'right',
  },
});
