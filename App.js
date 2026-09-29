// places2go — App entry / routing wrapper
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

import { colors, typography, spacing, radius, shadows } from './src/theme';
import useStore, { USER_ROLES } from './src/store/useStore';
import { ROUTES } from './src/navigation/routes';

// User screens
import SplashScreenView     from './src/screens/SplashScreen';
import OnboardingScreen     from './src/screens/OnboardingScreen';
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
  const hasCompletedOnboarding = useStore((s) => s.hasCompletedOnboarding);
  const currentUser            = useStore((s) => s.currentUser);
  const isModOrAdmin =
    currentUser.role === USER_ROLES.MOD || currentUser.role === USER_ROLES.ADMIN;

  return (
    <Stack.Navigator initialRouteName={ROUTES.SPLASH} screenOptions={stackScreenOptions}>
      {/* ── Splash & onboarding ────────────────────────────────────────── */}
      <Stack.Screen
        name={ROUTES.SPLASH}
        component={SplashScreenView}
        options={{ headerShown: false }}
        initialParams={{ nextRoute: hasCompletedOnboarding ? ROUTES.MAIN_TABS : ROUTES.ONBOARDING }}
      />
      <Stack.Screen name={ROUTES.ONBOARDING} component={OnboardingScreen} options={{ headerShown: false }} />

      {/* ── Main experience ────────────────────────────────────────────── */}
      <Stack.Screen name={ROUTES.MAIN_TABS}      component={MainTabs}            options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.RESULTS}        component={ResultsScreen}       options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.PLACE_DETAILS}  component={PlaceDetailsScreen}  options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.NAVIGATION}     component={NavigationScreen}    options={{ headerShown: false }} />
      <Stack.Screen name={ROUTES.RATE_REVIEW}    component={RateReviewScreen}    options={{ title: 'Rate This Place' }} />
      <Stack.Screen name={ROUTES.ADD_PLACE}      component={AddPlaceScreen}      options={{ title: 'Add a Place' }} />
      <Stack.Screen name={ROUTES.FOR_BUSINESS}   component={ForBusinessScreen}   options={{ title: 'For Business' }} />
      <Stack.Screen name={ROUTES.BIGGER_PICTURE} component={BiggerPictureScreen} options={{ headerShown: false }} />

      {/* ── Admin / mod (only registered for mod or admin roles) ────────── */}
      {isModOrAdmin ? (
        <>
          <Stack.Screen name={ROUTES.ADMIN_PANEL}     component={AdminPanelScreen}     options={{ ...adminStackOptions, title: 'Admin Panel' }} />
          <Stack.Screen name={ROUTES.MOD_QUEUE}       component={ModQueueScreen}       options={{ ...adminStackOptions, title: 'Moderation Queue' }} />
          <Stack.Screen name={ROUTES.ADMIN_SETTINGS}  component={AdminSettingsScreen}  options={{ ...adminStackOptions, title: 'App Settings' }} />
          <Stack.Screen name={ROUTES.ADMIN_AMENITIES} component={AdminAmenitiesScreen} options={{ ...adminStackOptions, title: 'Amenity Manager' }} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="dark" backgroundColor={colors.background} />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
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
