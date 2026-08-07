import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import {
  DarkTheme as NavDark,
  DefaultTheme as NavLight,
  NavigationContainer,
  Theme as NavTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UIProvider, useUI } from './ui';
import { LocationProvider } from './location';
import { ProfileProvider } from './profile';
import { AuthProvider, useAuth } from './auth';
import { BasketProvider } from './basket';
import { DataProvider } from './datactx';
import { Onboarding, SignInModal } from './components';
import { AccountScreen, ListScreen, PricesScreen, StoresScreen } from './screens';

const Tab = createBottomTabNavigator();

type IconName = keyof typeof Ionicons.glyphMap;
const ICONS: Record<string, [IconName, IconName]> = {
  Prices: ['pricetags', 'pricetags-outline'],
  List: ['cart', 'cart-outline'],
  Stores: ['storefront', 'storefront-outline'],
  Account: ['person-circle', 'person-circle-outline'],
};

function Tabs() {
  const { t, scheme } = useUI();

  const navTheme: NavTheme = {
    ...(scheme === 'dark' ? NavDark : NavLight),
    colors: {
      ...(scheme === 'dark' ? NavDark : NavLight).colors,
      primary: t.brand,
      background: t.paper,
      card: t.surface,
      text: t.ink,
      border: t.line,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Tab.Navigator
        initialRouteName="Prices"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: t.brand,
          tabBarInactiveTintColor: t.inkFaint,
          tabBarStyle: {
            backgroundColor: t.surface,
            borderTopColor: t.line,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          tabBarIcon: ({ color, size, focused }) => {
            const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
            return <Ionicons name={focused ? on : off} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Prices" component={PricesScreen} />
        <Tab.Screen name="List" component={ListScreen} />
        <Tab.Screen name="Stores" component={StoresScreen} />
        <Tab.Screen name="Account" component={AccountScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// Requires sign-in when accounts are configured: an un-dismissable sign-in page
// covers the app until you're signed in. Signing out makes it reappear. When
// Supabase isn't configured yet, there's nothing to sign into, so the app is open.
function Gate() {
  const { configured, loading, user } = useAuth();
  const { t } = useUI();
  if (configured && loading) return <View style={{ flex: 1, backgroundColor: t.paper }} />; // brief splash while restoring session
  const gateUp = configured && !user;
  return (
    <>
      <Tabs />
      {gateUp ? <SignInModal visible onClose={() => {}} gate /> : <Onboarding />}
    </>
  );
}

export default function App() {
  const [loaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    SpaceGrotesk_700Bold,
  });
  if (!loaded) return null;
  // Default every un-styled Text to Manrope (weights are set explicitly in styles).
  const T = Text as any;
  T.defaultProps = T.defaultProps || {};
  T.defaultProps.style = [{ fontFamily: 'Manrope_500Medium' }, T.defaultProps.style];
  return (
    <SafeAreaProvider>
      <UIProvider>
        <AuthProvider>
          <DataProvider>
            <LocationProvider>
              <ProfileProvider>
                <BasketProvider>
                  <Gate />
                </BasketProvider>
              </ProfileProvider>
            </LocationProvider>
          </DataProvider>
        </AuthProvider>
      </UIProvider>
    </SafeAreaProvider>
  );
}
