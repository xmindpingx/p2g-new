// places2go — App entry / routing wrapper
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// Default Mode: ON. Native Stack + Bottom Tabs. Every canonical screen is real.

import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import { StripeProvider } from './src/native/stripe';

import { colors, typography, spacing, radius, shadows } from './src/theme';
import useStore, { USER_ROLES } from './src/store/useStore';
import { ROUTES } from './src/navigation/routes';
import { isStripeConfigured } from './src/services/payments';

// User screens
import SplashScreenView     from './src/screens/SplashScreen';
import PartnerFinderScreen  from './src/screens/PartnerFinderScreen';
import TermsScreen          from './src/screens/TermsScreen';
import OnboardingScreen     from './src/screens/OnboardingScreen';
import AuthScreen           from './src/screens/AuthScreen';
import DonateScreen         from './src/screens/DonateScreen';
import PayoutMethodScreen   from './src/screens/PayoutMethodScreen';
import PayoutHistoryScreen  from './src/screens/PayoutHistoryScreen';
import MapScreen            from './src/screens/MapScreen';
import ResultsScreen        from './src/screens/ResultsScreen';
import PlaceDetailsScreen   from './src/screens/PlaceDetailsScreen';
import NavigationScreen     from './src/screens/NavigationScreen';
import RateReviewScreen     from './src/screens/RateReviewScreen';
import AddPlaceScreen       from './src/screens/AddPlaceScreen';
import ProfileScreen        from './src/screens/ProfileScreen';
import SavedPlacesScreen    from './src/screens/SavedPlacesScreen';
import ForBusinessScreen    from './src/screens/ForBusinessScreen';
import BiggerPictureScreen  from './src/screens/BiggerPictureScreen';
import ActivityScreen       from './src/screens/ActivityScreen';

// Mod / admin screens
import AdminPanelScreen     from './src/screens/AdminPanelScreen';
import ModQueueScreen       from './src/screens/ModQueueScreen';
import AdminSettingsScreen  from './src/screens/AdminSettingsScreen';
import AdminAmenitiesScreen from './src/screens/AdminAmenitiesScreen';
import AdminVerificationScreen from './src/screens/AdminVerificationScreen';
import AdminBugReportsScreen   from './src/screens/AdminBugReportsScreen';
import CoBrandingScreen        from './src/screens/CoBrandingScreen';
import CoBrandingPlaceScreen   from './src/screens/CoBrandingPlaceScreen';

import useErrorCapture         from './src/hooks/useErrorCapture';
import BugReportButton         from './src/components/BugReportButton';

export { ROUTES };

SplashScreen.preventAutoHideAsync().catch(() => {});

// Add tab stub (never rendered — the tab press is intercepted)
const AddTabStub = () => null;

// ---------------------------------------------------------------------------
// Navigation theme
// ---------------------------------------------------------------------------
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary:      colors.primary,
    background:   colors.background,
    card:         colors.surface,
    text:         colors.textPrimary,
    border:       colors.border,
    notification: colors.accent,
  },
};

const stackScreenOptions = {
  headerStyle:         { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor:     colors.textPrimary,
  headerTitleStyle: {
    fontFamily: typography.subheading.fontFamily,
    fontSize:   typography.subheading.fontSize,
    color:      colors.textPrimary,
  },
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

const adminStackOptions = {
  ...stackScreenOptions,
  headerStyle:     { backgroundColor: colors.adminHeaderBg },
  headerTintColor: colors.adminHeaderText,
  headerTitleStyle: {
    fontFamily: typography.subheading.fontFamily,
    fontSize:   typography.subheading.fontSize,
    color:      colors.adminHeaderText,
  },
  contentStyle: { backgroundColor: colors.adminSurface },
};

// ---------------------------------------------------------------------------
// Bottom tabs — Explore · Saved · Add · Activity · Profile
// ---------------------------------------------------------------------------
const TAB_ICONS = {
  [ROUTES.TAB_EXPLORE]:  { active: 'location',  inactive: 'location-outline'  },
  [ROUTES.TAB_SAVED]:    { active: 'bookmark',  inactive: 'bookmark-outline'  },
  [ROUTES.TAB_ACTIVITY]: { active: 'megaphone', inactive: 'megaphone-outline' },
  [ROUTES.TAB_PROFILE]:  { active: 'person',    inactive: 'person-outline'    },
};

const AddTabIcon = () => (
  <View style={styles.addTabButton}>
    <Ionicons name="add" size={26} color={colors.textOnDark} />
  </View>
);

const Tab = createBottomTabNavigator();

function MainTabs() {
  const unread = useStore((s) => s.activityFeed.filter((a) => !a.read).length);

  return (
    <Tab.Navigator
      initialRouteName={ROUTES.TAB_EXPLORE}
      screenOptions={({ route }) => ({
        headerShown:             false,
        tabBarActiveTintColor:   colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle:             styles.tabBar,
        tabBarLabelStyle:        styles.tabLabel,
        tabBarItemStyle:         styles.tabItem,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name={ROUTES.TAB_EXPLORE} component={MapScreen} />
      <Tab.Screen name={ROUTES.TAB_SAVED}   component={SavedPlacesScreen} />
      <Tab.Screen
        name={ROUTES.TAB_ADD}
        component={AddTabStub}
        options={{ tabBarLabel: 'Add', tabBarIcon: () => <AddTabIcon /> }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault();
            navigation.navigate(ROUTES.ADD_PLACE);
          },
        })}
      />
      <Tab.Screen
        name={ROUTES.TAB_ACTIVITY}
        component={ActivityScreen}
        options={{
          tabBarBadge:      unread > 0 ? unread : undefined,
          tabBarBadgeStyle: styles.tabBadge,
        }}
      />
      <Tab.Screen name={ROUTES.TAB_PROFILE} component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ---------------------------------------------------------------------------
// Root stack
// ---------------------------------------------------------------------------
const Stack = createNativeStackNavigator();

function RootNavigator() {
  const currentUser = useStore((s) => s.currentUser);
  const isAdmin      = currentUser.role === USER_ROLES.ADMIN;
  const isModOrAdmin = currentUser.role === USER_ROLES.MOD || isAdmin;

  return (
    <Stack.Navigator initialRouteName={ROUTES.SPLASH} screenOptions={stackScreenOptions}>
      {/* ── Splash → Terms → Onboarding → Sign-in (each decides the next step) ── */}
      <Stack.Screen name={ROUTES.SPLASH}     component={SplashScreenView} options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.TERMS}      component={TermsScreen}      options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name={ROUTES.ONBOARDING} component={OnboardingScreen} options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.AUTH}       component={AuthScreen}       options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.LEGAL}      component={TermsScreen}      options={{ headerShown: false }} initialParams={{ readOnly: true }} />

      {/* ── Main experience ────────────────────────────────────────────── */}
      <Stack.Screen name={ROUTES.MAIN_TABS}      component={MainTabs}            options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.RESULTS}        component={ResultsScreen}       options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.PLACE_DETAILS}  component={PlaceDetailsScreen}  options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.NAVIGATION}     component={NavigationScreen}    options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.RATE_REVIEW}    component={RateReviewScreen}    options={{ title: 'Rate This Place' }} />
      <Stack.Screen name={ROUTES.ADD_PLACE}      component={AddPlaceScreen}      options={{ title: 'Add a Place' }} />
      <Stack.Screen name={ROUTES.FOR_BUSINESS}   component={ForBusinessScreen}   options={{ title: 'For Business' }} />
      <Stack.Screen name={ROUTES.BIGGER_PICTURE} component={BiggerPictureScreen} options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.DONATE}         component={DonateScreen}        options={{ title: 'Support places2go' }} />
      <Stack.Screen name={ROUTES.PAYOUT_METHOD}  component={PayoutMethodScreen}  options={{ title: 'Payout Method' }} />
      <Stack.Screen name={ROUTES.PAYOUT_HISTORY} component={PayoutHistoryScreen} options={{ title: 'Your Payouts' }} />

      {/* ── Admin / mod (only registered for mod or admin roles) ────────── */}
      {isModOrAdmin ? (
        <>
          <Stack.Screen name={ROUTES.ADMIN_PANEL}     component={AdminPanelScreen}     options={{ ...adminStackOptions, title: 'Admin Panel' }} />
          <Stack.Screen name={ROUTES.MOD_QUEUE}       component={ModQueueScreen}       options={{ ...adminStackOptions, title: 'Moderation Queue' }} />
          <Stack.Screen name={ROUTES.ADMIN_SETTINGS}  component={AdminSettingsScreen}  options={{ ...adminStackOptions, title: 'App Settings' }} />
          <Stack.Screen name={ROUTES.ADMIN_AMENITIES} component={AdminAmenitiesScreen} options={{ ...adminStackOptions, title: 'Amenity Manager' }} />
        </>
      ) : null}

      {/* ── Admin only ─────────────────────────────────────────────────── */}
      {isAdmin ? (
        <>
          <Stack.Screen name={ROUTES.ADMIN_VERIFICATION} component={AdminVerificationScreen} options={{ ...adminStackOptions, title: 'Verification & Payouts' }} />
          <Stack.Screen name={ROUTES.ADMIN_BUG_REPORTS} component={AdminBugReportsScreen}   options={{ ...adminStackOptions, title: 'Bug Reports' }} />
          <Stack.Screen name={ROUTES.COBRANDING}         component={CoBrandingScreen}        options={{ ...adminStackOptions, title: 'Co-branding' }} />
          <Stack.Screen name={ROUTES.COBRANDING_PLACE}   component={CoBrandingPlaceScreen}   options={{ ...adminStackOptions, title: 'Partner Listing' }} />
          <Stack.Screen name={ROUTES.PARTNER_FINDER}     component={PartnerFinderScreen}     options={{ ...adminStackOptions, title: 'Find Partners' }} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  useErrorCapture();

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Stripe: the publishable key and Apple Pay merchant id come from Admin
  // Settings so they can be changed at runtime. When no key is set the provider
  // is skipped and the Donate screen shows a "not set up" state.
  const appSettings = useStore((s) => s.appSettings);
  const stripeReady = isStripeConfigured(appSettings);

  if (!fontsLoaded && !fontError) return null;

  const tree = (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <RootNavigator />
      </NavigationContainer>
      <BugReportButton />
    </SafeAreaProvider>
  );

  return stripeReady ? (
    <StripeProvider
      publishableKey={appSettings.stripePublishableKey.trim()}
      merchantIdentifier={appSettings.stripeMerchantIdentifier || undefined}
      urlScheme="places2go"
    >
      {tree}
    </StripeProvider>
  ) : tree;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor:  colors.border,
    borderTopWidth:  StyleSheet.hairlineWidth,
    height:          Platform.OS === 'ios' ? 84 : 64,
    paddingTop:      spacing.sm,
    paddingBottom:   Platform.OS === 'ios' ? spacing.xl : spacing.sm,
  },
  tabItem: {
    paddingVertical: spacing.xs,
  },
  tabLabel: {
    ...typography.tabLabel,
  },
  tabBadge: {
    backgroundColor: colors.accent,
    color:           colors.textOnAccent,
    fontFamily:      typography.badge.fontFamily,
    fontSize:        10,
  },
  addTabButton: {
    width:           44,
    height:          44,
    borderRadius:    radius.pill,
    backgroundColor: colors.tabAddButton,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       -spacing.sm,
    ...shadows.card,
  },
});
