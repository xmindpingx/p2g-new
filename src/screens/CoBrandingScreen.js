// places2go — CoBrandingScreen (admin only)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Every place with its partnership status, review count and rating, whether a
// business lookup has been done, and whether a partner banner is live. Filter
// by status, search by name. Tap a place to open its listing.

import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, spacing, radius } from '../theme';
import useStore from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { PARTNERSHIP_STATUS, PARTNERSHIP_STATUS_LABELS, PARTNERSHIP_STATUS_ORDER } from '../constants/cobranding';
import { buildRatingIndex } from '../utils/places';
import { isBannerLive } from '../utils/cobranding';
import SearchBar from '../components/SearchBar';
import StarRating from '../components/StarRating';

const STATUS_STYLE = {
  [PARTNERSHIP_STATUS.NOT_CONTACTED]: { bg: colors.modPendingBg,  text: colors.modPendingText },
  [PARTNERSHIP_STATUS.CONTACTED]:     { bg: colors.modFlaggedBg,  text: colors.modFlaggedText },
  [PARTNERSHIP_STATUS.IN_DISCUSSION]: { bg: colors.modFlaggedBg,  text: colors.modFlaggedText },
  [PARTNERSHIP_STATUS.ACTIVE]:        { bg: colors.modCleanBg,    text: colors.modCleanText },
  [PARTNERSHIP_STATUS.PAUSED]:        { bg: colors.modPendingBg,  text: colors.modPendingText },
  [PARTNERSHIP_STATUS.DECLINED]:      { bg: colors.modRejectedBg, text: colors.modRejectedText },
};

export default function CoBrandingScreen({ navigation }) {
  const insets      = useSafeAreaInsets();
  const places      = useStore((s) => s.places);
  const reviews     = useStore((s) => s.reviews);
  const coBranding  = useStore((s) => s.coBranding);
  const appSettings = useStore((s) => s.appSettings);

  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState('all');

  const ratingIndex = useMemo(() => buildRatingIndex(reviews), [reviews]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places
      .map((p) => {
        const profile = coBranding[p.id] || null;
        return {
          place:   p,
          profile,
          status:  profile?.status || PARTNERSHIP_STATUS.NOT_CONTACTED,
          rating:  ratingIndex[p.id] || { average: 0, count: 0 },
          lookedUp: !!profile?.business?.lookup,
          live:    isBannerLive(profile, appSettings),
        };
      })
      .filter((r) => filter === 'all' || r.status === filter)
      .filter((r) => !q || `${r.place.name} ${r.place.address}`.toLowerCase().includes(q))
      .sort((a, b) => PARTNERSHIP_STATUS_ORDER.indexOf(a.status) - PARTNERSHIP_STATUS_ORDER.indexOf(b.status) || b.rating.count - a.rating.count);
  }, [places, coBranding, ratingIndex, appSettings, query, filter]);

  const counts = useMemo(() => {
    const c = { all: places.length };
    for (const s of PARTNERSHIP_STATUS_ORDER) c[s] = 0;
    for (const p of places) c[coBranding[p.id]?.status || PARTNERSHIP_STATUS.NOT_CONTACTED] += 1;
    return c;
  }, [places, coBranding]);

  const renderItem = ({ item }) => {
    const st = STATUS_STYLE[item.status];
    return (
      <Pressable
        onPress={() => navigation.navigate(ROUTES.COBRANDING_PLACE, { placeId: item.place.id })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{item.place.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.place.address || 'No address'}{item.place.hasPublicRestroom === false ? ' · No public restroom' : ''}
          </Text>
          <View style={styles.ratingRow}>
            <StarRating rating={item.rating.average} size={12} />
            <Text style={styles.count}>{item.rating.count > 0 ? `${item.rating.average.toFixed(1)} (${item.rating.count})` : 'No reviews'}</Text>
            {item.lookedUp ? <Ionicons name="business-outline" size={13} color={colors.textSecondary} accessibilityLabel="Business looked up" /> : null}
            {item.live ? <View style={styles.liveDot} accessibilityLabel="Banner live" /> : null}
          </View>
        </View>
        <View style={[styles.pill, { backgroundColor: st.bg }]}>
          <Text style={[styles.pillText, { color: st.text }]}>{PARTNERSHIP_STATUS_LABELS[item.status]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <SearchBar value={query} onChangeText={setQuery} onSubmit={() => {}} placeholder="Search places" style={styles.search} />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={['all', ...PARTNERSHIP_STATUS_ORDER]}
        keyExtractor={(k) => k}
        contentContainerStyle={styles.filters}
        style={styles.filtersWrap}
        renderItem={({ item: key }) => (
          <Pressable onPress={() => setFilter(key)} accessibilityRole="button" style={[styles.filter, filter === key && styles.filterActive]}>
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {key === 'all' ? 'All' : PARTNERSHIP_STATUS_LABELS[key]} · {counts[key] ?? 0}
            </Text>
          </Pressable>
        )}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.place.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }, rows.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="storefront-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>No places match</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.adminSurface },
  search: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  filtersWrap: { flexGrow: 0 },
  filters: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  filter: { height: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.chipInactiveBg, borderWidth: 1, borderColor: colors.chipInactiveBorder, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.chipActiveBg, borderColor: colors.chipActiveBg },
  filterText: { ...typography.label, color: colors.chipInactiveText },
  filterTextActive: { color: colors.chipActiveText },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  listEmpty: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.adminBorder, padding: spacing.md },
  pressed: { opacity: 0.85 },
  rowText: { flex: 1 },
  name: { ...typography.bodyMedium },
  meta: { ...typography.label, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  count: { ...typography.label },
  liveDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.accent },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  pillText: { ...typography.badge },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { ...typography.subheading },
});
