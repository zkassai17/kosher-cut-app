// Small, tasteful animation helpers — built on React Native's Animated API (no
// extra packages, works in Expo Go). Kept subtle on purpose: this is a price tool,
// so motion should reinforce "you found a saving" and feel smooth, not gimmicky.

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Platform, StyleProp, UIManager, ViewStyle } from 'react-native';
import { money } from './prices';

// Enable smooth add/remove layout animations on Android (iOS is on by default).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Call right before a state update that adds/removes list rows → the change animates.
export function animateNext(): void {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

// Fades + scales its children in once on mount — used for the BEST pill and the
// "Save $X" badge so the eye lands on the deal.
export function Pop({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 6, tension: 140 }).start();
  }, [a]);
  return (
    <Animated.View style={[style, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// A price that counts up to its value (and smoothly transitions on change).
export function AnimatedMoney({ value, style }: { value: number; style?: StyleProp<any> }) {
  const a = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const id = a.addListener(({ value: v }) => setShown(v));
    Animated.timing(a, { toValue: value, duration: 520, useNativeDriver: false }).start();
    return () => a.removeListener(id);
  }, [a, value]);
  return <Animated.Text style={style}>{money(shown)}</Animated.Text>;
}
