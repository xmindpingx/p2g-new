// places2go — DonateScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Voluntary donations to fund the app:
//   • Card / Apple Pay / Google Pay through Stripe's PaymentSheet. The app asks
//     YOUR payments server for a PaymentIntent (the secret key never leaves the
//     server), then Stripe collects the payment in its own sheet.
//   • Cash App / Zelle: the admin's $Cashtag or Zelle contact with copy and
//     open buttons — the donor sends the transfer from their own app.
// Presets, minimum, currency and the thank-you message come from Admin Settings.

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, Linking, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePaymentSheet, PaymentSheetError } from '@stripe/stripe-react-native';
import * as Clipboard from 'expo-clipboard';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { LEGAL_DOCS } from '../constants/legal';
import { createDonationIntent, isStripeConfigured, isPaymentsApiConfigured, isStripeLiveKey, cashAppUrl } from '../services/payments';
import { normalizeCashtag } from '../store/useStore';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';
import { Chip } from '../components/FilterChips';

const parsePresets = (text) =>
  String(text || '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

export default function DonateScreen({ navigation }) {
  const insets       = useSafeAreaInsets();
  const appSettings  = useStore((s) => s.appSettings);
  const currentUser  = useStore((s) => s.currentUser);
  const recordDonation = useStore((s) => s.recordDonation);
  const donations    = useStore((s) => s.donations);

  const { initPaymentSheet, presentPaymentSheet } = usePaymentSheet();

  const presets  = useMemo(() => parsePresets(appSettings.donationPresetAmountsUSD), [appSettings.donationPresetAmountsUSD]);
  const minimum  = Number.isFinite(appSettings.donationMinimumUSD) ? appSettings.donationMinimumUSD : 1;
  const currency = (appSettings.donationCurrency || 'usd').toLowerCase();

  const [amount, setAmount]     = useState(presets[0] ? String(presets[0]) : '');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [copied, setCopied]     = useState(null);

  const amountNum   = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum >= minimum;
  const stripeReady = isStripeConfigured(appSettings) && isPaymentsApiConfigured(appSettings);
  const cashtag     = appSettings.cashAppEnabled ? normalizeCashtag(appSettings.donationCashAppCashtag || '') : '';
  const zelle       = appSettings.zelleEnabled ? (appSettings.donationZelleContact || '').trim() : '';

  const myDonations = useMemo(() => donations.filter((d) => d.userId === currentUser.id), [donations, currentUser.id]);

  const donateWithStripe = useCallback(async () => {
    setError(null);
    if (!amountValid) { setError(`Enter at least $${minimum.toFixed(2)}.`); return; }
    setBusy(true);
    try {
      const { clientSecret, paymentIntentId } = await createDonationIntent(appSettings, {
        amountUsd: amountNum,
        currency,
        userId:    currentUser.id,
        email:     currentUser.auth?.email || null,
      });
      const init = await initPaymentSheet({
        merchantDisplayName:       'places2go',
        paymentIntentClientSecret: clientSecret,
        returnURL:                 'places2go://stripe-redirect',
        applePay:  appSettings.stripeApplePayEnabled  ? { merchantCountryCode: appSettings.stripeMerchantCountryCode || 'US' } : undefined,
        googlePay: appSettings.stripeGooglePayEnabled ? { merchantCountryCode: appSettings.stripeMerchantCountryCode || 'US', currencyCode: currency.toUpperCase(), testEnv: appSettings.stripeGooglePayTestEnv !== false } : undefined,
        allowsDelayedPaymentMethods: false,
      });
      if (init.error) throw new Error(init.error.message || 'Could not start the payment sheet');

      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code === PaymentSheetError.Canceled) return; // user closed the sheet
        throw new Error(result.error.message || 'Payment did not complete');
      }
      recordDonation({ amount: amountNum, currency, paymentIntentId });
      Alert.alert('Thank you', appSettings.donationThankYouMessage || 'Thank you for supporting places2go.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [amountValid, amountNum, minimum, appSettings, currency, currentUser, initPaymentSheet, presentPaymentSheet, recordDonation, navigation]);

  const copy = useCallback(async (label, value) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      Alert.alert('Could not copy', value);
    }
  }, []);

  const openCashApp = useCallback(async () => {
    const url = cashAppUrl(cashtag, amountValid ? amountNum : null);
    if (!url) return;
    try { await Linking.openURL(url); } catch (err) { Alert.alert('Could not open Cash App', url); }
  }, [cashtag, amountValid, amountNum]);

  if (!appSettings.donationsEnabled) {
    return (
      <View style={styles.missing}>
        <Text style={typography.subheading}>Donations are not open right now</Text>
        <PrimaryButton label="Go back" variant="secondary" onPress={() => navigation.goBack()} style={styles.missingButton} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          places2go is free to use and pays contributors for every verified place. Donations cover hosting, maps, moderation and those credits. Donations are voluntary gifts and are not refundable or tax-deductible unless we tell you otherwise in writing.
        </Text>

        <SectionHeader title="Amount (USD)" />
        <View style={styles.presets}>
          {presets.map((p) => (
            <Chip key={p} label={`$${p}`} active={amountNum === p} onPress={() => setAmount(String(p))} />
          ))}
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.currency}>$</Text>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={minimum.toFixed(2)}
            placeholderTextColor={colors.placeholder}
            style={styles.amountInput}
            accessibilityLabel="Donation amount"
          />
        </View>
        {amount && !amountValid ? <Text style={styles.error}>The minimum donation is ${minimum.toFixed(2)}.</Text> : null}

        {/* Stripe */}
        <SectionHeader title="Card, Apple Pay or Google Pay" />
        {stripeReady ? (
          <>
            <PrimaryButton label={amountValid ? `Donate $${amountNum.toFixed(2)}` : 'Donate'} onPress={donateWithStripe} disabled={!amountValid} loading={busy} />
            <Text style={styles.caption}>
              Processed securely by Stripe{isStripeLiveKey(appSettings) ? '' : ' (test mode)'}. We never see your card number.
            </Text>
          </>
        ) : (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.noticeText}>Card payments are not set up yet. Add the Stripe publishable key and payments server URL in Admin Settings → Stripe.</Text>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Cash App / Zelle */}
        {cashtag || zelle ? <SectionHeader title="Or send directly" /> : null}
        {cashtag ? (
          <View style={styles.direct}>
            <View style={styles.directText}>
              <Text style={styles.directLabel}>Cash App</Text>
              <Text style={styles.directValue}>{cashtag}</Text>
            </View>
            <Pressable onPress={() => copy('cashapp', cashtag)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Copy $Cashtag">
              <Ionicons name={copied === 'cashapp' ? 'checkmark' : 'copy-outline'} size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable onPress={openCashApp} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Open in Cash App">
              <Ionicons name="open-outline" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        ) : null}
        {zelle ? (
          <View style={styles.direct}>
            <View style={styles.directText}>
              <Text style={styles.directLabel}>Zelle</Text>
              <Text style={styles.directValue}>{zelle}</Text>
            </View>
            <Pressable onPress={() => copy('zelle', zelle)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Copy Zelle contact">
              <Ionicons name={copied === 'zelle' ? 'checkmark' : 'copy-outline'} size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        ) : null}
        {zelle ? <Text style={styles.caption}>Send from your bank's app using Zelle. Please put "places2go" in the memo.</Text> : null}

        {myDonations.length ? (
          <>
            <SectionHeader title="Your donations" />
            {myDonations.map((d) => (
              <View key={d.id} style={styles.row}>
                <Text style={styles.rowText}>{new Date(d.createdAt).toLocaleDateString()}</Text>
                <Text style={styles.rowAmount}>${d.amount.toFixed(2)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Pressable onPress={() => navigation.navigate(ROUTES.LEGAL, { readOnly: true, doc: LEGAL_DOCS.TERMS })} style={styles.link} accessibilityRole="link">
          <Text style={styles.linkText}>Donation terms (Terms of Service, section 9)</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  intro: { ...typography.caption },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  currency: { ...typography.title, marginRight: spacing.xs },
  amountInput: { flex: 1, height: 56, fontFamily: fonts.semiBold, fontSize: fontSizes.xxl, color: colors.textPrimary },
  caption: { ...typography.caption, marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.modRejectedText, marginTop: spacing.sm },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  noticeText: { ...typography.caption, flex: 1 },
  direct: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  directText: { flex: 1 },
  directLabel: { ...typography.label },
  directValue: { ...typography.bodyMedium, marginTop: 2 },
  iconButton: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  rowText: { ...typography.caption },
  rowAmount: { ...typography.bodyMedium },
  link: { paddingVertical: spacing.md },
  linkText: { ...typography.captionMedium, color: colors.primary },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  missingButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
