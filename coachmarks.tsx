// First-run spotlight coach-marks. Each tab, on its first visit, dims the screen
// and walks the user through its key parts one at a time (tooltip + Next). Robust
// by design: if a target can't be measured, the tip still shows centered — it
// never looks broken. Seen-state is per tab in AsyncStorage.

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, LayoutRectangle, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUI } from './ui';
import { sans } from './theme';

export type CoachTab = 'prices' | 'list' | 'stores' | 'account';

interface Step {
  id: string;
  title: string;
  text: string;
}

// The tour for each tab. Steps anchored to a real element (search, cats, toggle,
// cheapest, stores, lists) spotlight it; the rest show as a centered tip. Aim for
// ~3-4 per page — enough to teach every feature without dragging.
const TOURS: Record<CoachTab, Step[]> = {
  prices: [
    { id: 'search', title: 'Search any product', text: 'Find anything across every nearby store — not just the staples. Try “green beans” or “cholent meat”.' },
    {
      id: 'cats',
      title: 'Compare by category',
      text: 'Chicken, Beef, Dairy, Pantry. Every item shows each store’s price side by side, with the cheapest flagged BEST.',
    },
    {
      id: 'brands',
      title: 'Compare brands',
      text: 'On dairy & pantry items, tap the › to open a brand-by-brand page — see exactly which brand is cheapest at which store.',
    },
    { id: 'deals', title: 'Today’s deals', text: 'The 🔥 Deals tab surfaces the biggest savings near you right now, and stores only appear where they actually carry an item.' },
  ],
  list: [
    { id: 'toggle', title: '1 store vs Split', text: 'Shop the cheapest single store for one trip — or Split across stores to squeeze out every dollar.' },
    { id: 'cheapest', title: 'Your cheapest total', text: 'We total your whole list at each store, so you always know where to go.' },
    { id: 'build', title: 'Build & check off', text: 'Add items from any category, tick them off as you shop, and drop in one-off “just this trip” items.' },
  ],
  stores: [
    {
      id: 'stores',
      title: 'Stores near you',
      text: 'Every kosher store in your area, how far it is, and what it carries. Tap the location up top to change your area or distance.',
    },
    { id: 'customize', title: 'Customize the preview', text: 'Choose which items show on each store card, so you’re always comparing the same things at a glance.' },
    { id: 'ads', title: 'Weekly circulars', text: 'Some stores post a weekly sale flyer (like Cedar’s). Tap a store to see this week’s deals.' },
  ],
  account: [
    { id: 'lists', title: 'Your lists', text: 'Tap a list to edit it, or keep separate lists for Shabbos, Yom Tov, and your weekly run — they sync to your account.' },
    { id: 'swipe', title: 'Swipe to delete', text: 'Slide any list you made to the right to reveal a trash button and remove it.' },
    { id: 'share', title: 'Share & import', text: 'Send a list to family with the paper-plane ✈, or import one they send — paste their message, or just type your items.' },
  ],
};

const SEEN_KEY = (tab: CoachTab) => `kc.coach.${tab}.v2`;
const DISABLE_KEY = 'kc.coach.disabled.v1'; // "Skip all" turns off every tour

type RefMap = Record<string, Record<string, React.RefObject<View | null>>>;

interface CoachAPI {
  register: (tab: CoachTab, id: string, ref: React.RefObject<View | null>) => void;
  startIfUnseen: (tab: CoachTab) => void;
}

const CoachContext = createContext<CoachAPI>({ register: () => {}, startIfUnseen: () => {} });

export function useCoachTarget(tab: CoachTab, id: string): React.RefObject<View | null> {
  const ref = useRef<View>(null);
  const { register } = useContext(CoachContext);
  useEffect(() => {
    register(tab, id, ref);
  }, [register, tab, id]);
  return ref;
}

// Wrap any element to make it a coach-mark target (measured for the spotlight).
export function CoachTarget({
  tab,
  id,
  children,
  style,
}: {
  tab: CoachTab;
  id: string;
  children: ReactNode;
  style?: any;
}) {
  const ref = useCoachTarget(tab, id);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

export function CoachProvider({ children }: { children: ReactNode }) {
  const refs = useRef<RefMap>({});
  const [tab, setTab] = useState<CoachTab | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<LayoutRectangle | null>(null);
  // Tracks the tour that's active (or already ran this session) via a ref, so the
  // re-entry guard never resets a tour mid-way when the provider re-renders.
  const activeRef = useRef<Set<CoachTab>>(new Set());
  const showingRef = useRef(false);

  const register = useCallback((t: CoachTab, id: string, ref: React.RefObject<View | null>) => {
    (refs.current[t] ||= {})[id] = ref;
  }, []);

  // Stable reference (empty deps) — otherwise every render would re-fire the
  // per-tab trigger effect and reset the tour to step 0.
  const startIfUnseen = useCallback(async (t: CoachTab) => {
    try {
      if (showingRef.current || activeRef.current.has(t)) return; // a tour is up, or this one already ran
      if (await AsyncStorage.getItem(DISABLE_KEY)) return;
      if (!(await AsyncStorage.getItem('kc.onboarded.v1'))) return; // wait until the welcome intro is dismissed
      if (await AsyncStorage.getItem(SEEN_KEY(t))) return;
      if (!TOURS[t]?.length) return;
      activeRef.current.add(t);
      showingRef.current = true;
      setStep(0);
      setTab(t);
    } catch {
      /* ignore */
    }
  }, []);

  // Measure the current step's target so the spotlight can sit on it. Small delay
  // lets layout settle; a missing/unmounted target just falls back to centered.
  useEffect(() => {
    if (!tab) return;
    const s = TOURS[tab]?.[step];
    setRect(null);
    if (!s) return;
    const node = refs.current[tab]?.[s.id]?.current;
    if (!node?.measureInWindow) return;
    const timer = setTimeout(() => {
      try {
        node.measureInWindow((x, y, w, h) => {
          if (w > 0 && h > 0) setRect({ x, y, width: w, height: h });
        });
      } catch {
        /* keep centered */
      }
    }, 260);
    return () => clearTimeout(timer);
  }, [tab, step]);

  const finish = async (disableAll = false) => {
    if (tab) {
      try {
        await AsyncStorage.setItem(SEEN_KEY(tab), '1');
        if (disableAll) await AsyncStorage.setItem(DISABLE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    showingRef.current = false; // allow the next tab's tour to start
    setTab(null);
    setStep(0);
    setRect(null);
  };

  const next = () => {
    if (tab && step + 1 < TOURS[tab].length) setStep((s) => s + 1);
    else finish();
  };

  return (
    <CoachContext.Provider value={{ register, startIfUnseen }}>
      {children}
      {tab ? (
        <CoachOverlay
          step={TOURS[tab][step]}
          index={step}
          total={TOURS[tab].length}
          rect={rect}
          onNext={next}
          onSkip={() => finish(true)}
        />
      ) : null}
    </CoachContext.Provider>
  );
}

export function useTabCoach(tab: CoachTab, focused: boolean) {
  const { startIfUnseen } = useContext(CoachContext);
  useEffect(() => {
    if (!focused) return;
    const timer = setTimeout(() => startIfUnseen(tab), 550); // let the screen render first
    return () => clearTimeout(timer);
  }, [focused, tab, startIfUnseen]);
}

function CoachOverlay({
  step,
  index,
  total,
  rect,
  onNext,
  onSkip,
}: {
  step: Step;
  index: number;
  total: number;
  rect: LayoutRectangle | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { t } = useUI();
  const insets = useSafeAreaInsets();
  const { width: SW, height: SH } = Dimensions.get('window');
  const dim = 'rgba(0,0,0,0.72)';
  const pad = 6; // spotlight padding around the target

  // Tooltip sits below the target if there's room, else above; centered if no rect.
  const spot = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 } : null;
  const below = spot ? spot.y + spot.h + 250 < SH : true;
  const cardTop = spot ? (below ? spot.y + spot.h + 12 : undefined) : SH / 2 - 90;
  const cardBottom = spot && !below ? SH - spot.y + 12 : undefined;

  const strip = (s: object) => <View style={[{ position: 'absolute', backgroundColor: dim }, s]} />;

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      {/* Dim everything; if we have a target rect, leave a clear "spotlight" over it. */}
      {spot ? (
        <>
          {strip({ left: 0, top: 0, width: SW, height: Math.max(0, spot.y) })}
          {strip({ left: 0, top: spot.y + spot.h, width: SW, height: Math.max(0, SH - spot.y - spot.h) })}
          {strip({ left: 0, top: spot.y, width: Math.max(0, spot.x), height: spot.h })}
          {strip({ left: spot.x + spot.w, top: spot.y, width: Math.max(0, SW - spot.x - spot.w), height: spot.h })}
          {/* highlight ring */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: spot.x,
              top: spot.y,
              width: spot.w,
              height: spot.h,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: t.brand,
            }}
          />
        </>
      ) : (
        <Pressable onPress={onNext} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: dim }} />
      )}

      {/* Tooltip card */}
      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          top: cardTop,
          bottom: cardBottom,
          backgroundColor: t.surface,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: t.line,
          padding: 16,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Text style={{ color: t.brand, fontSize: 11, fontFamily: sans.bold, letterSpacing: 0.5 }}>
          {`STEP ${index + 1} OF ${total}`}
        </Text>
        <Text style={{ color: t.ink, fontSize: 17, fontFamily: sans.bold, marginTop: 4 }}>{step.title}</Text>
        <Text style={{ color: t.inkSoft, fontSize: 14, fontFamily: sans.med, marginTop: 6, lineHeight: 20 }}>{step.text}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <Pressable onPress={onSkip} hitSlop={8}>
            <Text style={{ color: t.inkFaint, fontSize: 13, fontFamily: sans.semi }}>Skip tour</Text>
          </Pressable>
          <Pressable
            onPress={onNext}
            style={{ backgroundColor: t.brand, paddingHorizontal: 22, paddingVertical: 9, borderRadius: 11 }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontFamily: sans.bold }}>{index + 1 < total ? 'Next' : 'Got it'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Safe-area breathing room at the very bottom for the card when it's anchored there */}
      <View style={{ height: insets.bottom }} pointerEvents="none" />
    </View>
  );
}
