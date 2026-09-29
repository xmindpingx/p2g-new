// places2go — PayoutMethodScreen
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// How the contributor wants to receive credits:
//   Stripe   — Stripe Connect onboarding through your payments server; Stripe
//              holds the banking details, the app only stores the status.
//   Cash App — the contributor's $Cashtag; the admin pays from Cash App and
//              marks the credit paid.
//   Zelle    — the email or US mobile number enrolled with Zelle; same flow.
// Only methods the admin has enabled are offered.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { showAlert } from '../utils/alert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { colors, typography, spacing, radius, fonts, fontSizes } from '../theme';
import useStore, { PAYOUT_METHODS, PAYOUT_METHOD_LABELS, CASHTAG_PATTERN, isValidPayoutContact } from '../store/useStore';
import { ROUTES } from '../navigation/routes';
import { LEGAL_DOCS } from '../constants/legal';
import { createConnectOnboardingLink, fetchConnectStatus, isPaymentsApiConfigured } from '../services/payments';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeader from '../components/SectionHeader';

export default function PayoutMethodScreen({ navigation }) {
  const insets       = useSafeAreaInsets();
  const appSettings  = useStore((s) => s.appSettings);
  const currentUser  = useStore((s) => s.currentUser);
  const setPayoutMethod        = useStore((s) => s.setPayoutMethod);
  const setStripeConnectStatus = useStore((s) => s.setStripeConnectStatus);

  const existing = currentUser.payoutMethod;
  const [type, setType]           = useState(existing?.type || null);
  const [cashtag, setCashtag]     = useState(existing?.cashtag || '');
  const [zelle, setZelle]         = useState(existing?.zelleContact || '');
  const [appleCash, setAppleCash] = useState(existing?.appleCashContact || '');
  const [googlePay, setGooglePay] = useState(existing?.googlePayContact || '');
  const [holder, setHolder]       = useState(existing?.holderName || '');
  const [busy, setBusy]           = useState(false);
  const [stripeError, setStripeError] = useState(null);

  const options = [
    appSettings.payoutsViaStripeConnect ? { key: PAYOUT_METHODS.STRIPE,   icon: 'card-outline',      caption: 'Bank transfer through Stripe. Stripe verifies your identity and holds your bank details.' } : null,
    appSettings.cashAppEnabled          ? { key: PAYOUT_METHODS.CASH_APP, icon: 'cash-outline',      caption: 'Paid to your $Cashtag by the places2go administrator.' } : null,
    appSettings.zelleEnabled            ? { key: PAYOUT_METHODS.ZELLE,    icon: 'send-outline',      caption: 'Paid to the email or US mobile number enrolled with Zelle.' } : null,
    appSettings.applePayPayoutsEnabled  ? { key: PAYOUT_METHODS.APPLE_CASH, icon: 'logo-apple',      caption: 'Sent with Apple Pay to the phone number or email on your Apple Cash. iPhone only.' } : null,
    appSettings.googlePayPayoutsEnabled ? { key: PAYOUT_METHODS.GOOGLE_PAY, icon: 'logo-google',     caption: 'Sent from the Google Pay app to the phone number or email on your Google account.' } : null,
  ].filter(Boolean);

  const stripe = currentUser.stripeConnect;
  const paymentsReady = isPaymentsApiConfigured(appSettings);

  const refreshStripe = useCallback(async () => {
    if (!paymentsReady) return;
    try {
      const status = await fetchConnectStatus(appSettings, { userId: currentUser.id });
      setStripeConnectStatus(status);
    } catch (err) {
      setStripeError(err.message);
    }
  }, [paymentsReady, appSettings, currentUser.id, setStripeConnectStatus]);

  useEffect(() => { if (type === PAYOUT_METHODS.STRIPE && stripe?.accountId) refreshStripe(); }, [type, stripe?.accountId, refreshStripe]);

  const startStripeOnboarding = useCallback(async () => {
    setStripeError(null);
    if (!paymentsReady) { setStripeError('The payments server is not configured yet (Admin Settings → Stripe).'); return; }
    setBusy(true);
    try {
      const returnUrl  = Linking.createURL('stripe-connect/return');
      const refreshUrl = Linking.createURL('stripe-connect/refresh');
      const { url } = await createConnectOnboardingLink(appSettings, { userId: currentUser.id, returnUrl, refreshUrl });
      await WebBrowser.openAuthSessionAsync(url, returnUrl);
      await refreshStripe();
      const latest = useStore.getState().currentUser.stripeConnect;
      if (latest?.payoutsEnabled) {
        setPayoutMethod({ type: PAYOUT_METHODS.STRIPE });
        showAlert('Stripe connected', 'Your account is ready to receive payouts.');
      } else {
        showAlert('Almost there', 'Stripe has not finished verifying your account yet. You can come back and check the status later.');
      }
    } catch (err) {
      setStripeError(err.message);
    } finally {
      setBusy(false);
    }
  }, [paymentsReady, appSettings, currentUser.id, refreshStripe, setPayoutMethod]);

  const cashtagValid = CASHTAG_PATTERN.test(cashtag.trim());
  const zelleValid     = isValidPayoutContact(zelle);
  const appleCashValid = isValidPayoutContact(appleCash);
  const googlePayValid = isValidPayoutContact(googlePay);

  const save = useCallback(() => {
    try {
      if (type === PAYOUT_METHODS.CASH_APP) setPayoutMethod({ type, cashtag, holderName: holder });
      else if (type === PAYOUT_METHODS.ZELLE) setPayoutMethod({ type, zelleContact: zelle, holderName: holder });
      else if (type === PAYOUT_METHODS.APPLE_CASH) setPayoutMethod({ type, appleCashContact: appleCash, holderName: holder });
      else if (type === PAYOUT_METHODS.GOOGLE_PAY) setPayoutMethod({ type, googlePayContact: googlePay, holderName: holder });
      else if (type === PAYOUT_METHODS.STRIPE) setPayoutMethod({ type });
      navigation.goBack();
    } catch (err) {
      showAlert('Not saved', err.message);
    }
  }, [type, cashtag, zelle, appleCash, googlePay, holder, setPayoutMethod, navigation]);

  const remove = () =>
    showAlert('Remove payout method?', 'Approved credits stay approved; they will be paid once you add a method again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { setPayoutMethod(null); navigation.goBack(); } },
    ]);

  const canSave =
    (type === PAYOUT_METHODS.CASH_APP && cashtagValid) ||
    (type === PAYOUT_METHODS.ZELLE && zelleValid) ||
    (type === PAYOUT_METHODS.APPLE_CASH && appleCashValid) ||
    (type === PAYOUT_METHODS.GOOGLE_PAY && googlePayValid) ||
    (type === PAYOUT_METHODS.STRIPE && stripe?.payoutsEnabled);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Choose how you would like to receive your ${appSettings.payoutAmountUSD.toFixed(2)} contribution credits. You must be at least {appSettings.legalContributorMinimumAge} to receive payouts; see the Contributor Terms for the details.
        </Text>

        {options.length === 0 ? (
          <Text style={styles.caption}>No payout methods are enabled right now.</Text>
        ) : null}

        {options.map((o) => (
          <Pressable
            key={o.key}
            onPress={() => setType(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: type === o.key }}
            style={[styles.option, type === o.key && styles.optionActive]}
          >
            <Ionicons name={o.icon} size={22} color={colors.textPrimary} />
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{PAYOUT_METHOD_LABELS[o.key]}</Text>
              <Text style={styles.optionCaption}>{o.caption}</Text>
            </View>
            <Ionicons name={type === o.key ? 'radio-button-on' : 'radio-button-off'} size={20} color={type === o.key ? colors.primary : colors.textSecondary} />
          </Pressable>
        ))}

        {type === PAYOUT_METHODS.STRIPE ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Stripe Connect</Text>
            <Text style={styles.caption}>
              {stripe?.payoutsEnabled
                ? 'Your Stripe account is ready to receive payouts.'
                : stripe?.accountId
                  ? 'Stripe still needs some details before payouts can be sent. Continue the setup below.'
                  : 'You will be taken to Stripe to enter your details. Stripe keeps your bank information; places2go only learns whether payouts are enabled.'}
            </Text>
            {stripe?.checkedAt ? <Text style={styles.caption}>Status checked {new Date(stripe.checkedAt).toLocaleString()}.</Text> : null}
            {stripeError ? <Text style={styles.error}>{stripeError}</Text> : null}
            <PrimaryButton
              label={stripe?.payoutsEnabled ? 'Check status again' : stripe?.accountId ? 'Continue Stripe setup' : 'Set up payouts with Stripe'}
              onPress={stripe?.payoutsEnabled ? refreshStripe : startStripeOnboarding}
              loading={busy}
              variant={stripe?.payoutsEnabled ? 'secondary' : 'primary'}
            />
          </View>
        ) : null}

        {type === PAYOUT_METHODS.CASH_APP ? (
          <View style={styles.panel}>
            <SectionHeader title="Your $Cashtag" style={styles.firstHeader} />
            <TextInput
              value={cashtag}
              onChangeText={setCashtag}
              placeholder="$yourcashtag"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {cashtag && !cashtagValid ? <Text style={styles.error}>A $Cashtag starts with a letter and uses letters, numbers, hyphens or underscores.</Text> : null}
            <SectionHeader title="Name on the account" />
            <TextInput value={holder} onChangeText={setHolder} placeholder="So the admin can confirm it's you" placeholderTextColor={colors.placeholder} style={styles.input} />
            <Text style={styles.caption}>Double-check the $Cashtag. A payment sent to a wrong $Cashtag you entered cannot be recovered.</Text>
          </View>
        ) : null}

        {type === PAYOUT_METHODS.ZELLE ? (
          <View style={styles.panel}>
            <SectionHeader title="Email or US mobile number enrolled with Zelle" style={styles.firstHeader} />
            <TextInput
              value={zelle}
              onChangeText={setZelle}
              placeholder="name@example.com or (555) 555-5555"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            {zelle && !zelleValid ? <Text style={styles.error}>Enter a valid email address or US mobile number.</Text> : null}
            <SectionHeader title="Name on the account" />
            <TextInput value={holder} onChangeText={setHolder} placeholder="As it appears at your bank" placeholderTextColor={colors.placeholder} style={styles.input} />
            <Text style={styles.caption}>Zelle sends to the exact contact enrolled at your bank. A payment sent to details you entered incorrectly cannot be recovered.</Text>
          </View>
        ) : null}

        {type === PAYOUT_METHODS.APPLE_CASH ? (
          <View style={styles.panel}>
            <SectionHeader title="Phone number or email on your Apple Cash" style={styles.firstHeader} />
            <TextInput
              value={appleCash}
              onChangeText={setAppleCash}
              placeholder="(555) 555-5555 or name@icloud.com"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            {appleCash && !appleCashValid ? <Text style={styles.error}>Enter a valid US mobile number or email address.</Text> : null}
            <SectionHeader title="Name on the account" />
            <TextInput value={holder} onChangeText={setHolder} placeholder="So the admin can confirm it's you" placeholderTextColor={colors.placeholder} style={styles.input} />
            <Text style={styles.caption}>The administrator sends the payment with Apple Pay from an iPhone; it arrives in your Apple Cash. Apple Cash must be set up in your Wallet. A payment sent to details you entered incorrectly cannot be recovered.</Text>
          </View>
        ) : null}

        {type === PAYOUT_METHODS.GOOGLE_PAY ? (
          <View style={styles.panel}>
            <SectionHeader title="Phone number or email on your Google Pay" style={styles.firstHeader} />
            <TextInput
              value={googlePay}
              onChangeText={setGooglePay}
              placeholder="(555) 555-5555 or name@gmail.com"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />
            {googlePay && !googlePayValid ? <Text style={styles.error}>Enter a valid US mobile number or email address.</Text> : null}
            <SectionHeader title="Name on the account" />
            <TextInput value={holder} onChangeText={setHolder} placeholder="So the admin can confirm it's you" placeholderTextColor={colors.placeholder} style={styles.input} />
            <Text style={styles.caption}>The administrator sends the payment from the Google Pay app to this contact. Google Pay person-to-person payments are only offered in some countries. A payment sent to details you entered incorrectly cannot be recovered.</Text>
          </View>
        ) : null}

        <Pressable onPress={() => navigation.navigate(ROUTES.LEGAL, { readOnly: true, doc: LEGAL_DOCS.CONTRIBUTOR })} style={styles.link} accessibilityRole="link">
          <Text style={styles.linkText}>Read the Contributor Payout Terms</Text>
        </Pressable>

        {type ? <PrimaryButton label="Save payout method" onPress={save} disabled={!canSave} style={styles.save} /> : null}
        {existing ? <PrimaryButton label="Remove payout method" variant="secondary" onPress={remove} style={styles.remove} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  intro: { ...typography.caption, marginBottom: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  optionActive: { borderColor: colors.primary },
  optionText: { flex: 1 },
  optionLabel: { ...typography.bodyMedium },
  optionCaption: { ...typography.label, marginTop: 2 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.sm, gap: spacing.sm },
  panelTitle: { ...typography.bodyMedium },
  firstHeader: { marginTop: 0 },
  input: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: fontSizes.md, color: colors.textPrimary },
  caption: { ...typography.caption },
  error: { ...typography.caption, color: colors.modRejectedText },
  link: { paddingVertical: spacing.sm },
  linkText: { ...typography.captionMedium, color: colors.primary },
  save: { marginTop: spacing.sm },
  remove: { marginTop: spacing.xs },
});
