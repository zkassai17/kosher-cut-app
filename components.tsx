import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUI } from './ui';
import { useLocation } from './location';
import { useProfile } from './profile';
import { useBasket } from './basket';
import { display, sans } from './theme';
import { WeeklyAd, weeklyAdFor } from './weeklyAds';
import { AREAS, areaStores, PriceStatus, StoreWithDist } from './stores';
import { hasCatalog } from './catalog';
import {
  AreaDeal,
  biggestSavings,
  bothPriced,
  Chip,
  Cut,
  LIVE_CATEGORIES,
  money,
  STORE_ABBR,
  STORE_SHORT,
  unitSuffix,
  Winner,
  winnerOf,
} from './data';
import { categoryLows, cheapestAt, StoreRank, Unit } from './prices';

/* Compact top bar — safe-area padded so it clears the notch/status bar. */
export function AppHeader() {
  const { s } = useUI();
  const { origin } = useLocation();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <View style={s.mark}>
        <Text style={s.markText}>KC</Text>
      </View>
      <View>
        <Text style={s.wordmark}>KOSHER CUT</Text>
        <Text style={s.wordmarkSub}>KOSHER PRICE CHECK</Text>
      </View>
      <View style={s.locPill}>
        <Text style={s.locPillDot}>◉</Text>
        <Text style={s.locPillText}>{origin.label}</Text>
      </View>
    </View>
  );
}

/* A plain-spoken "this week" note — the biggest real gap, in a sentence. */
export function WeekHighlight() {
  const { s } = useUI();
  const top = biggestSavings()[0];
  return (
    <View style={s.week}>
      <Text style={s.weekEyebrow}>Updated this week · Teaneck & Englewood</Text>
      <Text style={s.weekHead}>
        {top.cut} is <Text style={s.weekSave}>{money(top.save)}/lb cheaper</Text> at{' '}
        <Text style={s.weekStore}>{top.store}</Text> right now.
      </Text>
      <Text style={s.weekSub}>
        We checked prices on both stores' sites. They trade off cut by cut — so it's worth a look
        before you drive over.
      </Text>
      <View style={s.weekRule} />
    </View>
  );
}

export function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string; count: number }[];
}) {
  const { s } = useUI();
  return (
    <View style={s.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} style={[s.segBtn, active && s.segBtnActive]} onPress={() => onChange(o.key)}>
            <Text style={[s.segText, active && s.segTextActive]}>{o.label}</Text>
            <Text style={[s.segCount, active && s.segCountActive]}>{o.count} cuts</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type PillState = 'win' | 'lose' | 'tie' | 'none';

function PricePill({ label, price, state }: { label: string; price: number | null; state: PillState }) {
  const { s } = useUI();
  if (price == null) {
    return (
      <View style={[s.pill, s.pillLose]}>
        <Text style={s.pillLabel}>{label}</Text>
        <Text style={s.pillPriceLose}>—</Text>
      </View>
    );
  }
  const box = state === 'win' ? s.pillWin : state === 'tie' ? s.pillTie : s.pillLose;
  const priceStyle = state === 'win' ? s.pillPriceWin : state === 'lose' ? s.pillPriceLose : s.pillPrice;
  return (
    <View style={[s.pill, box]}>
      <Text style={s.pillLabel}>{label}</Text>
      <Text style={priceStyle}>{money(price)}</Text>
      {state === 'win' && <Text style={s.pillFlag}>BEST</Text>}
      {state === 'tie' && <Text style={s.pillFlagMuted}>TIE</Text>}
    </View>
  );
}

export function CutRow({ c }: { c: Cut }) {
  const { s } = useUI();
  const w: Winner = winnerOf(c);
  let caption: string;
  if (bothPriced(c)) {
    caption =
      w === 'tie'
        ? 'Same price at both'
        : `Save ${money(Math.abs((c.ge as number) - (c.gl as number)))}${unitSuffix(c.unit)} at ${STORE_SHORT[w as 'ge' | 'gl']}`;
  } else {
    caption = `Only ${STORE_SHORT[w as 'ge' | 'gl']} lists this — other coming`;
  }
  const stateFor = (store: 'ge' | 'gl'): PillState =>
    !bothPriced(c) ? (w === store ? 'win' : 'none') : w === 'tie' ? 'tie' : w === store ? 'win' : 'lose';
  return (
    <View style={s.cutRow}>
      <View style={s.cutLeft}>
        <Text style={s.cutName}>{c.cut}</Text>
        <Text style={[s.cutSave, (w === 'tie' || !bothPriced(c)) && s.cutSaveMuted]}>{caption}</Text>
      </View>
      <View style={s.pillGroup}>
        <PricePill label="G&E" price={c.ge} state={stateFor('ge')} />
        <PricePill label="Glatt" price={c.gl} state={stateFor('gl')} />
      </View>
    </View>
  );
}

/* Compare one item across the stores near you (2–3 columns, cheapest green). */
export function CompareRow({
  item,
  unit,
  storeIds,
  prices,
  cat,
  id,
  checked,
  onToggle,
  soloClean,
}: {
  item: string;
  unit: Unit;
  storeIds: string[];
  prices: (number | null)[];
  cat?: string;
  id?: string;
  checked?: boolean; // override the ✓ state (e.g. "this trip" picker)
  onToggle?: () => void; // override the add/remove action
  soloClean?: boolean; // single-store row shown under an "only at one store" header — drop the redundant caption
}) {
  const { s, t } = useUI();
  const basket = useBasket();
  const overridden = onToggle !== undefined;
  const canAdd = overridden || (!!cat && !!id);
  const inList = overridden ? !!checked : cat && id ? basket.has(cat, id) : false;
  const doToggle = overridden ? onToggle : cat && id ? () => basket.toggle(cat, id) : undefined;

  const valid = prices.filter((p): p is number => p != null);
  const min = valid.length ? Math.min(...valid) : null;
  const sorted = [...valid].sort((a, b) => a - b);
  const save = sorted.length >= 2 && sorted[0] < sorted[1] ? sorted[1] - sorted[0] : 0;
  const winnerIdx = min != null ? prices.indexOf(min) : -1;
  const multi = valid.length >= 2;

  let caption = '';
  if (!multi) caption = winnerIdx >= 0 ? `Only ${STORE_ABBR[storeIds[winnerIdx]]} lists this` : '';
  else if (save === 0) caption = 'Same price';
  else caption = `Save ${money(save)}${unitSuffix(unit)} at ${STORE_ABBR[storeIds[winnerIdx]]}`;

  const reportPrice = () =>
    Alert.alert('Report a price', `Flag a wrong price for "${item}"? We'll re-check it at the store.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Report', onPress: () => Alert.alert('Thanks', `We'll re-check ${item}.`) },
    ]);

  return (
    <View style={s.cutRow}>
      <Pressable
        style={s.cutLeft}
        onPress={canAdd ? doToggle : undefined}
        onLongPress={reportPrice}
        hitSlop={6}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {canAdd ? (
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                marginRight: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: inList ? t.brand : 'transparent',
                borderWidth: 1.5,
                borderColor: inList ? t.brand : t.lineStrong,
              }}
            >
              <Text style={{ color: inList ? '#fff' : t.inkSoft, fontSize: 14, fontWeight: '800', marginTop: -1 }}>
                {inList ? '✓' : '+'}
              </Text>
            </View>
          ) : null}
          <Text style={[s.cutName, { flexShrink: 1 }]}>{item}</Text>
        </View>
        {caption && !soloClean ? <Text style={[s.cutSave, (!multi || save === 0) && s.cutSaveMuted]}>{caption}</Text> : null}
      </Pressable>
      <View style={s.pillGroup}>
        {storeIds.map((sid, i) => {
          const p = prices[i];
          // Only one store lists it → neutral (no BEST/TIE flag; caption says "Only X").
          // Two+ stores: cheapest = BEST, unless the two cheapest are equal → TIE.
          const isTie = multi && save === 0;
          const state: PillState =
            p == null ? 'none' : !multi ? 'none' : p === min ? (isTie ? 'tie' : 'win') : 'lose';
          return <PricePill key={sid} label={STORE_ABBR[sid] ?? sid} price={p} state={state} />;
        })}
      </View>
    </View>
  );
}

/* Search box for the Prices tab. */
export function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useUI();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 18,
        marginTop: 6,
        paddingHorizontal: 14,
        height: 44,
        borderRadius: 12,
        backgroundColor: t.surface2,
        borderWidth: 1,
        borderColor: t.line,
      }}
    >
      <Text style={{ color: t.inkFaint, fontSize: 15, marginRight: 8 }}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search items — e.g. cutlets, eggs"
        placeholderTextColor={t.inkFaint}
        autoCorrect={false}
        style={{ flex: 1, color: t.ink, fontSize: 15, fontFamily: sans.med, padding: 0 }}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8}>
          <Text style={{ color: t.inkFaint, fontSize: 16 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* Horizontal selector of the saved lists (Shabbos / Rosh Hashana / …). Tapping
   one makes it active (highlighted) and switches the view to that list. */
export function ListChips() {
  const { t } = useUI();
  const { lists, activeId, setActive } = useBasket();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingVertical: 4 }}
    >
      {lists.map((l) => {
        const on = l.id === activeId;
        return (
          <Pressable
            key={l.id}
            onPress={() => setActive(l.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              height: 38,
              borderRadius: 19,
              backgroundColor: on ? t.brand : t.surface2,
              borderWidth: 1,
              borderColor: on ? t.brand : t.line,
            }}
          >
            <Text style={{ fontSize: 15 }}>{l.emoji}</Text>
            <Text style={{ color: on ? '#fff' : t.ink, fontSize: 14, fontFamily: on ? sans.bold : sans.semi }}>
              {l.label}
            </Text>
            {l.items.length > 0 ? (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  paddingHorizontal: 5,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? 'rgba(255,255,255,0.25)' : t.line,
                }}
              >
                <Text style={{ color: on ? '#fff' : t.inkSoft, fontSize: 11, fontFamily: sans.bold }}>
                  {l.items.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* The active-list name as a dropdown — tap it to pick another list from a menu
   that opens right beneath it. (Used alongside the pills on the List tab.) */
export function ListPicker() {
  const { t } = useUI();
  const { lists, activeId, active, setActive } = useBasket();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ y: 120, h: 0 });
  const triggerRef = useRef<View>(null);

  const openMenu = () => {
    const node = triggerRef.current;
    if (node && node.measureInWindow) {
      node.measureInWindow((_x, y, _w, h) => {
        setPos({ y, h });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        hitSlop={6}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
        }}
      >
        <Text style={{ fontSize: 15 }}>{active.emoji}</Text>
        <Text style={{ color: t.ink, fontFamily: sans.bold, fontSize: 14 }} numberOfLines={1}>
          {active.label}
        </Text>
        <Text style={{ color: t.inkFaint, fontSize: 12 }}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute',
              top: pos.y + pos.h + 6,
              right: 18,
              minWidth: 230,
              maxWidth: 320,
              backgroundColor: t.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: t.line,
              paddingVertical: 6,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            {lists.map((l) => {
              const on = l.id === activeId;
              return (
                <Pressable
                  key={l.id}
                  onPress={() => {
                    setActive(l.id);
                    setOpen(false);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 }}
                >
                  <Text style={{ fontSize: 18 }}>{l.emoji}</Text>
                  <Text style={{ flex: 1, color: t.ink, fontSize: 15, fontFamily: on ? sans.bold : sans.med }}>
                    {l.label}
                  </Text>
                  <Text style={{ color: t.inkFaint, fontSize: 12.5, fontFamily: sans.med }}>{l.items.length}</Text>
                  {on ? <Text style={{ color: t.brand, fontSize: 15, fontFamily: sans.bold }}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function CheapestChips({ chips }: { chips: Chip[] }) {
  const { s } = useUI();
  return (
    <View style={{ flexDirection: 'row', gap: 9, paddingHorizontal: 18 }}>
      {chips.map((c) => (
        <View key={c.name} style={[s.chip, { flex: 1, minWidth: 0 }]}>
          <Text style={s.chipName} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={s.chipPrice} numberOfLines={1}>
            {money(c.price)}
            {c.unit === 'lb' ? <Text style={s.chipUnit}> /lb</Text> : null}
          </Text>
          <Text style={s.chipStore} numberOfLines={1}>
            {c.store}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DealRow({ d, rank }: { d: AreaDeal; rank: number }) {
  const { s } = useUI();
  const perLabel = d.unit === 'lb' ? 'PER LB' : 'CHEAPER';
  return (
    <View style={s.dealRow}>
      <View style={s.dealRank}>
        <Text style={s.dealRankText}>{rank}</Text>
      </View>
      <View style={s.dealMid}>
        <Text style={s.dealCut}>{d.cut}</Text>
        <Text style={s.dealMeta}>
          {money(d.price)}
          {unitSuffix(d.unit)} at <Text style={s.dealMetaStore}>{d.store}</Text>
        </Text>
      </View>
      <View style={s.dealSave}>
        <Text style={s.dealSaveNum}>−{money(d.save)}</Text>
        <Text style={s.dealSaveUnit}>{perLabel}</Text>
      </View>
    </View>
  );
}

export function VisionCard({ lab, body }: { lab: string; body: string }) {
  const { s } = useUI();
  return (
    <View style={s.visionCard}>
      <Text style={s.visionLab}>{lab}</Text>
      <Text style={s.visionBody}>{body}</Text>
    </View>
  );
}

/* ---- location picking ---- */

const MILE_OPTIONS = [5, 10, 15, 25, 50];

export function LocationControls() {
  const { s } = useUI();
  const { origin, maxMiles, gpsStatus, setArea, setMaxMiles, useMyLocation } = useLocation();

  return (
    <View>
      <Pressable style={s.gpsBtn} onPress={useMyLocation} disabled={gpsStatus === 'loading'}>
        {gpsStatus === 'loading' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={s.gpsBtnText}>◎  Use my current location</Text>
          </>
        )}
      </Pressable>
      {gpsStatus === 'error' && (
        <Text style={s.gpsError}>Couldn't get your location — enable location access, or pick an area below.</Text>
      )}

      <View style={s.orRow}>
        <View style={s.orLine} />
        <Text style={s.orText}>OR PICK AN AREA</Text>
        <View style={s.orLine} />
      </View>

      <View style={s.pickRow}>
        {AREAS.map((a) => {
          const active = origin.source === 'area' && origin.label === a.label;
          return (
            <Pressable key={a.id} style={[s.pick, active && s.pickActive]} onPress={() => setArea(a)}>
              <Text style={[s.pickText, active && s.pickTextActive]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.eyebrow}>HOW FAR WILL YOU GO?</Text>
      <View style={s.pickRow}>
        {MILE_OPTIONS.map((m) => {
          const active = m === maxMiles;
          return (
            <Pressable key={m} style={[s.milesChip, active && s.milesChipActive]} onPress={() => setMaxMiles(m)}>
              <Text style={[s.milesNum, active && s.milesNumActive]}>{m}</Text>
              <Text style={[s.milesUnit, active && s.milesUnitActive]}>MILES</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: PriceStatus }) {
  const { s } = useUI();
  if (status === 'live')
    return (
      <View style={s.statusLive}>
        <Text style={s.statusLiveText}>LIVE PRICES</Text>
      </View>
    );
  if (status === 'online')
    return (
      <View style={s.statusOnline}>
        <Text style={s.statusOnlineText}>ONLINE</Text>
      </View>
    );
  return (
    <View style={s.statusReq}>
      <Text style={s.statusReqText}>BY REQUEST</Text>
    </View>
  );
}

/* ===== Uber-Eats-style home feed ===== */

const STORE_VIS: Record<string, { mono: string; color: string }> = {
  ge: { mono: 'G&E', color: '#1E5140' },
  gl: { mono: 'GX', color: '#2A5C8A' },
  superstop: { mono: 'SS', color: '#C25A2E' },
  cedar: { mono: 'CM', color: '#6B7A3A' },
  maadan: { mono: 'M', color: '#7A5C8A' },
  gourmetglatt: { mono: 'GG', color: '#8A3B34' },
  seasons_law: { mono: 'S', color: '#2E7D6B' },
  kolsave: { mono: 'KS', color: '#8A6D3B' },
  kmp: { mono: 'KMP', color: '#3A6B8A' },
};

/* The koshercart wordmark: mono-line green cart + "kosher" (ink) "cart" (green),
   lowercase Space Grotesk. */
export function BrandMark({ size = 21 }: { size?: number }) {
  const { t } = useUI();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <Ionicons name="cart-outline" size={size + 4} color={t.logoGreen} style={{ marginTop: -1 }} />
      <Text style={{ fontFamily: display, fontSize: size, letterSpacing: -0.6 }}>
        <Text style={{ color: t.ink }}>kosher</Text>
        <Text style={{ color: t.logoGreen }}>cart</Text>
      </Text>
    </View>
  );
}

export function FeedHeader({ onDeals }: { onDeals?: () => void }) {
  const { s } = useUI();
  const { origin } = useLocation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.feedHeaderWrap, { paddingTop: insets.top + 8 }]}>
      <View style={s.brandRow}>
        <BrandMark />
        {onDeals ? (
          <Pressable style={s.dealsBtn} onPress={onDeals} hitSlop={8}>
            <Text style={{ fontSize: 14 }}>🔥</Text>
            <Text style={s.dealsBtnText}>Deals</Text>
          </Pressable>
        ) : (
          // No Deals button here (all tabs except Prices) → location sits top-right.
          <Pressable
            style={[s.feedAddr, { flexShrink: 1, marginLeft: 12 }]}
            onPress={() => setOpen(true)}
            hitSlop={8}
          >
            <Text style={s.feedAddrPin}>◉</Text>
            <Text numberOfLines={1} style={[s.feedAddrText, { fontSize: 15 }]}>
              {origin.label}
            </Text>
            <Text style={s.feedChevron}>▾</Text>
          </Pressable>
        )}
      </View>
      {onDeals ? (
        <Pressable style={[s.feedAddr, { marginTop: 12 }]} onPress={() => setOpen(true)} hitSlop={8}>
          <Text style={s.feedAddrPin}>◉</Text>
          <Text style={s.feedAddrText}>{origin.label}</Text>
          <Text style={s.feedChevron}>▾</Text>
        </Pressable>
      ) : null}
      <LocationModal visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

/* Prominent header where the LOCATION is the title (Stores tab). Tap → popup. */
export function LocationHeader({ subtitle }: { subtitle?: string }) {
  const { s } = useUI();
  const { origin } = useLocation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.locHeader, { paddingTop: insets.top + 10 }]}>
      <View style={{ marginBottom: 12 }}>
        <BrandMark />
      </View>
      <Pressable onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={s.locHeaderCity}>
          {origin.label} <Text style={s.locHeaderChevron}>▾</Text>
        </Text>
      </Pressable>
      {subtitle ? <Text style={s.locHeaderSub}>{subtitle}</Text> : null}
      <LocationModal visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

/* Tap the city in the header → this popup: use-my-location, area pills, distance slider. */
export function LocationModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, t } = useUI();
  const { origin, maxMiles, gpsStatus, setArea, setMaxMiles, useMyLocation, setAddress } = useLocation();
  const insets = useSafeAreaInsets();
  const [addr, setAddr] = useState('');

  const submitAddr = async () => {
    if (!addr.trim()) return;
    const ok = await setAddress(addr);
    if (ok) {
      setAddr('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.modalBackdrop} onPress={onClose}>
          <Pressable style={[s.modalSheet, { paddingBottom: insets.bottom + 18 }]} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Where are you?</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <TextInput
                value={addr}
                onChangeText={setAddr}
                placeholder="Enter your address or zip"
                placeholderTextColor={t.inkFaint}
                returnKeyType="search"
                onSubmitEditing={submitAddr}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: t.line,
                  backgroundColor: t.surface2,
                  paddingHorizontal: 14,
                  color: t.ink,
                  fontSize: 15,
                  fontFamily: sans.med,
                }}
              />
              <Pressable
                onPress={submitAddr}
                disabled={gpsStatus === 'loading'}
                style={{
                  paddingHorizontal: 18,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: t.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {gpsStatus === 'loading' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontFamily: sans.bold, fontSize: 14 }}>Find</Text>
                )}
              </Pressable>
            </View>

            <Pressable style={s.gpsBtn} onPress={useMyLocation} disabled={gpsStatus === 'loading'}>
              {gpsStatus === 'loading' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.gpsBtnText}>◎  Use my current location</Text>
              )}
            </Pressable>
            {gpsStatus === 'error' && (
              <Text style={s.gpsError}>Couldn't find that — check the address or pick an area below.</Text>
            )}

            <View style={s.orRow}>
            <View style={s.orLine} />
            <Text style={s.orText}>OR PICK AN AREA</Text>
            <View style={s.orLine} />
          </View>
          <View style={s.pickRow}>
            {AREAS.map((a) => {
              const active = origin.source === 'area' && origin.label === a.label;
              return (
                <Pressable key={a.id} style={[s.pick, active && s.pickActive]} onPress={() => setArea(a)}>
                  <Text style={[s.pickText, active && s.pickTextActive]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.sliderRow}>
            <Text style={s.sliderLabel}>How far will you go?</Text>
            <Text style={s.sliderValue}>{maxMiles} mi</Text>
          </View>
          <Slider
            minimumValue={2}
            maximumValue={50}
            step={1}
            value={maxMiles}
            onValueChange={setMaxMiles}
            minimumTrackTintColor={t.brand}
            maximumTrackTintColor={t.line}
            thumbTintColor={t.brand}
          />

            <Pressable style={s.modalDone} onPress={onClose}>
              <Text style={s.modalDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Account → Settings: name, and how location is decided (auto GPS vs a set area/
   address) + the mile range. Everything here persists (name, location prefs). */
const APP_VERSION = 'koshercart v1';
const FEEDBACK_EMAIL = 'zkassai17@gmail.com';

export function SettingsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, t, themeMode, setThemeMode } = useUI();
  const { name, setName } = useProfile();
  const { origin, maxMiles, autoLocate, hiddenStores, gpsStatus, setArea, setMaxMiles, setAutoLocate, toggleStore, setAddress } =
    useLocation();
  const insets = useSafeAreaInsets();
  const [addr, setAddr] = useState('');
  const shopStores = areaStores(origin, maxMiles).filter((st) => hasCatalog(st.id));

  const submitAddr = async () => {
    if (!addr.trim()) return;
    const ok = await setAddress(addr);
    if (ok) setAddr('');
  };

  const sectionLabel = { color: t.inkFaint, fontSize: 13, fontFamily: sans.bold, letterSpacing: 0.4, marginTop: 24, marginBottom: 10 } as const;
  const field = {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.surface2,
    paddingHorizontal: 14,
    color: t.ink,
    fontSize: 15,
    fontFamily: sans.med,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}>
          <Text style={s.h1clean}>Settings</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{ paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: '#fff', fontFamily: sans.bold }}>Done</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
          >
            <Text style={sectionLabel}>YOUR NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Add your name"
              placeholderTextColor={t.inkFaint}
              style={field}
              returnKeyType="done"
            />

            <Text style={sectionLabel}>LOCATION</Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                backgroundColor: t.surface,
                borderWidth: 1,
                borderColor: t.line,
                borderRadius: 14,
                padding: 14,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontFamily: sans.semi }}>Use my location automatically</Text>
                <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 2, fontFamily: sans.med }}>
                  Show stores near wherever you are.
                </Text>
              </View>
              <Switch
                value={autoLocate}
                onValueChange={setAutoLocate}
                trackColor={{ true: t.brand, false: t.lineStrong }}
                thumbColor="#fff"
              />
            </View>
            {autoLocate && gpsStatus === 'error' ? (
              <Text style={{ color: t.oxblood, fontSize: 12.5, marginTop: 8, fontFamily: sans.med }}>
                Couldn't get your location — turn this off to set an area instead, or check location permissions.
              </Text>
            ) : null}

            {!autoLocate ? (
              <>
                <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 16, marginBottom: 8, fontFamily: sans.semi }}>
                  Or set a location
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TextInput
                    value={addr}
                    onChangeText={setAddr}
                    placeholder="Enter your address or zip"
                    placeholderTextColor={t.inkFaint}
                    returnKeyType="search"
                    onSubmitEditing={submitAddr}
                    style={[field, { flex: 1 }]}
                  />
                  <Pressable
                    onPress={submitAddr}
                    disabled={gpsStatus === 'loading'}
                    style={{ paddingHorizontal: 18, height: 48, borderRadius: 12, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}
                  >
                    {gpsStatus === 'loading' ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontFamily: sans.bold, fontSize: 14 }}>Find</Text>}
                  </Pressable>
                </View>
                <View style={s.pickRow}>
                  {AREAS.map((a) => {
                    const on = origin.source === 'area' && origin.label === a.label;
                    return (
                      <Pressable key={a.id} style={[s.pick, on && s.pickActive]} onPress={() => setArea(a)}>
                        <Text style={[s.pickText, on && s.pickTextActive]}>{a.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <View style={s.sliderRow}>
              <Text style={s.sliderLabel}>How far will you go?</Text>
              <Text style={s.sliderValue}>{maxMiles} mi</Text>
            </View>
            <Slider
              minimumValue={2}
              maximumValue={50}
              step={1}
              value={maxMiles}
              onValueChange={setMaxMiles}
              minimumTrackTintColor={t.brand}
              maximumTrackTintColor={t.line}
              thumbTintColor={t.brand}
            />

            {shopStores.length > 1 ? (
              <>
                <Text style={sectionLabel}>STORES YOU SHOP</Text>
                <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 14, overflow: 'hidden' }}>
                  {shopStores.map((st, i) => (
                    <View
                      key={st.id}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
                    >
                      <Text style={{ color: t.ink, fontSize: 15, fontFamily: sans.med, flexShrink: 1, marginRight: 12 }} numberOfLines={1}>
                        {st.name}
                      </Text>
                      <Switch
                        value={!hiddenStores.includes(st.id)}
                        onValueChange={() => toggleStore(st.id)}
                        trackColor={{ true: t.brand, false: t.lineStrong }}
                        thumbColor="#fff"
                      />
                    </View>
                  ))}
                </View>
                <Text style={{ color: t.inkFaint, fontSize: 12, marginTop: 8, fontFamily: sans.med }}>
                  Turn off a store to leave it out of your comparisons.
                </Text>
              </>
            ) : null}

            <Text style={sectionLabel}>APPEARANCE</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['auto', 'light', 'dark'] as const).map((m) => {
                const on = themeMode === m;
                return (
                  <Pressable key={m} onPress={() => setThemeMode(m)} style={[s.pick, { flex: 1, alignItems: 'center' }, on && s.pickActive]}>
                    <Text style={[s.pickText, on && s.pickTextActive]}>{m === 'auto' ? 'Auto' : m === 'light' ? 'Light' : 'Dark'}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={sectionLabel}>ABOUT</Text>
            <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 14, overflow: 'hidden' }}>
              <Pressable
                onPress={() => Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=koshercart%20feedback`)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 }}
              >
                <Text style={{ color: t.ink, fontSize: 15, fontFamily: sans.med }}>✉️  Send feedback</Text>
                <Text style={{ color: t.inkFaint, fontSize: 20 }}>›</Text>
              </Pressable>
              <Pressable
                onPress={() => Share.share({ message: 'koshercart — find where kosher groceries are cheapest near you.' })}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.line }}
              >
                <Text style={{ color: t.ink, fontSize: 15, fontFamily: sans.med }}>⭐  Tell a friend</Text>
                <Text style={{ color: t.inkFaint, fontSize: 20 }}>›</Text>
              </Pressable>
            </View>
            <Text style={{ color: t.inkFaint, fontSize: 12, textAlign: 'center', marginTop: 18, fontFamily: sans.med }}>
              {APP_VERSION} · made in NJ
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// Pill toggle (Uber-style chips) — used on the Compare tab for Chicken/Beef.
export function PillTabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string }[];
}) {
  const { s } = useUI();
  // Few tabs → split the row evenly (full width). Many → horizontal scroll.
  if (options.length <= 4) {
    return (
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingVertical: 4 }}>
        {options.map((o) => {
          const active = o.key === value;
          return (
            <Pressable
              key={o.key}
              style={[s.fchip, { flex: 1, justifyContent: 'center' }, active && s.fchipActive]}
              onPress={() => onChange(o.key)}
            >
              <Text style={[s.fchipText, active && s.fchipTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable key={o.key} style={[s.fchip, active && s.fchipActive]} onPress={() => onChange(o.key)}>
            <Text style={[s.fchipText, active && s.fchipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function FilterChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { s } = useUI();
  const chips = [
    { key: 'all', label: 'All' },
    { key: 'chicken', label: '🍗 Chicken' },
    { key: 'beef', label: '🥩 Beef' },
    { key: 'deals', label: '🏷️ Deals' },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipScroll}>
      {chips.map((c) => {
        const active = c.key === value;
        return (
          <Pressable key={c.key} style={[s.fchip, active && s.fchipActive]} onPress={() => onChange(c.key)}>
            <Text style={[s.fchipText, active && s.fchipTextActive]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// Categories with data are tappable; the rest are the roadmap (dimmed).
const FUTURE = [
  { key: 'fish', emoji: '🐟', label: 'Fish' },
  { key: 'pantry', emoji: '🥫', label: 'Pantry' },
  { key: 'snacks', emoji: '🍪', label: 'Snacks' },
];

export function CategoryTiles({ onPick, active }: { onPick: (k: string) => void; active?: string }) {
  const { s } = useUI();
  const tiles = [
    ...LIVE_CATEGORIES.map((c) => ({ key: c.key, emoji: c.emoji, label: c.label, live: true })),
    ...FUTURE.map((f) => ({ ...f, live: false })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tileScroll}>
      {tiles.map((c) => (
        <Pressable key={c.key} style={s.tile} onPress={() => c.live && onPick(c.key)}>
          <View style={[s.tileCircle, active === c.key && s.tileCircleActive, { opacity: c.live ? 1 : 0.45 }]}>
            <Text style={s.tileEmoji}>{c.emoji}</Text>
          </View>
          <Text style={[s.tileLabel, { opacity: c.live ? 1 : 0.5 }]}>{c.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function SectionHeader({ title }: { title: string }) {
  const { s, t } = useUI();
  return (
    <View style={s.secHead}>
      <Text style={s.secTitle}>{title}</Text>
      <View style={s.secArrow}>
        <Text style={{ fontSize: 15, color: t.ink }}>→</Text>
      </View>
    </View>
  );
}

export function DealCard({ d, category }: { d: AreaDeal; category: 'chicken' | 'beef' }) {
  const { s, t } = useUI();
  const tint = category === 'chicken' ? '#F3E6C8' : '#EBD7D2';
  return (
    <View style={s.dcard}>
      <View style={[s.dcardTop, { backgroundColor: tint }]}>
        <View style={s.dcardBadge}>
          <Text style={s.dcardBadgeText}>Save {money(d.save)}/lb</Text>
        </View>
        <Text style={s.dcardEmoji}>{category === 'chicken' ? '🍗' : '🥩'}</Text>
      </View>
      <Text style={s.dcardName}>{d.cut}</Text>
      <Text style={s.dcardMeta}>
        {money(d.price)}/lb at <Text style={s.dcardMetaStore}>{d.store}</Text>
      </Text>
    </View>
  );
}

export function StoreCard({ store }: { store: StoreWithDist }) {
  const { s } = useUI();
  const vis = STORE_VIS[store.id] ?? { mono: store.name.slice(0, 2), color: '#556' };
  const lows = categoryLows(store.id);
  return (
    <View style={s.scard}>
      <View style={[s.scHeader, { backgroundColor: vis.color }]}>
        <View style={s.scTopRow}>
          {store.status === 'live' ? (
            <View style={[s.scPromo, { backgroundColor: '#1E7A4E' }]}>
              <Text style={s.scPromoText}>Live prices</Text>
            </View>
          ) : store.status === 'online' ? (
            <View style={[s.scPromo, { backgroundColor: '#B8851E' }]}>
              <Text style={s.scPromoText}>Prices online</Text>
            </View>
          ) : (
            <View style={[s.scPromo, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={s.scPromoText}>By request</Text>
            </View>
          )}
          <View style={s.scHeart}>
            <Text style={{ fontSize: 16 }}>♡</Text>
          </View>
        </View>
        <Text style={s.scMono}>{vis.mono}</Text>
      </View>
      <View style={s.scBody}>
        <Text style={s.scName}>{store.name}</Text>
        <View style={s.scMetaRow}>
          {store.status === 'live' && <View style={s.scLiveDot} />}
          <Text style={s.scMeta}>
            <Text style={s.scMetaStrong}>{store.miles.toFixed(1)} mi</Text> · {store.city}
          </Text>
        </View>
        {lows.length ? (
          <View style={s.scList}>
            {lows.map((l) => (
              <View key={l.catKey} style={s.scListRow}>
                <Text style={s.scListCat}>
                  {l.emoji} {l.catLabel}
                </Text>
                <Text style={s.scListItem} numberOfLines={1}>
                  {l.itemLabel}
                </Text>
                <Text style={s.scListPrice}>
                  {money(l.price)}
                  {unitSuffix(l.unit)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={s.scByReq}>{store.note ?? 'Prices in store'}</Text>
        )}
      </View>
    </View>
  );
}

/* Clean ranked-store row for the Prices tab (cheapest-first, no clutter). */
export function RankedStoreRow({
  rank,
  name,
  miles,
  r,
}: {
  rank: number;
  name: string;
  miles?: number;
  r: StoreRank;
}) {
  const { s } = useUI();
  const top = rank === 1;
  return (
    <View style={[s.rankRow, top && s.rankRowTop]}>
      <View style={[s.rankNum, top && s.rankNumTop]}>
        <Text style={[s.rankNumText, top && s.rankNumTextTop]}>{rank}</Text>
      </View>
      <View style={s.rankMid}>
        <Text style={s.rankStore}>{name}</Text>
        <Text style={s.rankSub}>
          {r.itemLabel} · {r.itemCount} item{r.itemCount === 1 ? '' : 's'} priced
        </Text>
        {top && (
          <View style={s.cheapestTag}>
            <Text style={s.cheapestTagText}>CHEAPEST</Text>
          </View>
        )}
      </View>
      <View style={s.rankRight}>
        <Text style={[s.rankPrice, top && s.rankPriceTop]}>
          from {money(r.price)}
          {unitSuffix(r.unit)}
        </Text>
        {miles != null && <Text style={s.rankDist}>{miles.toFixed(1)} mi</Text>}
      </View>
    </View>
  );
}

/* Clean store card for the Stores tab — name, distance, per-category lows. */
export function StoreCard2({ store }: { store: StoreWithDist }) {
  const { s, t } = useUI();
  const lows = categoryLows(store.id);
  const ad = weeklyAdFor(store.id);
  const [adOpen, setAdOpen] = useState(false);
  const statusLabel =
    store.status === 'live' ? 'Live prices' : store.status === 'online' ? 'Prices online' : 'By request';
  return (
    <View style={s.storeCard2}>
      <View style={s.storeCard2Top}>
        <Text style={s.storeCard2Name}>{store.name}</Text>
        <Text style={s.storeCard2Dist}>{store.miles.toFixed(1)} mi</Text>
      </View>
      <Text style={s.storeCard2Meta}>
        {store.city} · {statusLabel}
      </Text>
      {lows.length ? (
        <View style={s.scList}>
          {lows.map((l) => (
            <View key={l.catKey} style={s.scListRow}>
              <Text style={s.scListCat}>{l.catLabel}</Text>
              <Text style={s.scListItem} numberOfLines={1}>
                {l.itemLabel}
              </Text>
              <Text style={s.scListPrice}>
                {money(l.price)}
                {unitSuffix(l.unit)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={s.scByReq}>{store.note ?? 'Prices in store'}</Text>
      )}

      {ad ? (
        <Pressable
          onPress={() => setAdOpen(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            marginTop: 12,
            alignSelf: 'flex-start',
            paddingHorizontal: 13,
            height: 34,
            borderRadius: 17,
            backgroundColor: t.goldBg,
            borderWidth: 1,
            borderColor: t.goldLine,
          }}
        >
          <Text style={{ fontSize: 14 }}>📄</Text>
          <Text style={{ color: t.gold, fontFamily: sans.bold, fontSize: 13 }}>
            This week's ad · {ad.effective}
          </Text>
        </Pressable>
      ) : null}
      {ad ? <WeeklyAdModal storeName={store.name} ad={ad} visible={adOpen} onClose={() => setAdOpen(false)} /> : null}
    </View>
  );
}

/* Store's weekly circular: a few verified highlights + a link to the full ad. */
export function WeeklyAdModal({
  storeName,
  ad,
  visible,
  onClose,
}: {
  storeName: string;
  ad: WeeklyAd;
  visible: boolean;
  onClose: () => void;
}) {
  const { s, t } = useUI();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}
        >
          <Text style={[s.h1clean, { flexShrink: 1, marginRight: 12 }]}>{storeName}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 16, color: t.inkSoft }}>✕</Text>
          </Pressable>
        </View>
        <Text style={s.listHint}>📄 Weekly ad · effective {ad.effective}</Text>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
          <View style={{ paddingHorizontal: 18 }}>
            {!ad.highlights.length ? (
              <Text style={{ color: t.inkSoft, fontSize: 14.5, lineHeight: 21, fontFamily: sans.med, marginTop: 4 }}>
                Cedar's full weekly circular — meat, produce, dairy, grocery & deli — is one tap away.
              </Text>
            ) : null}
            {ad.highlights.map((it) => (
              <View
                key={it.name}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: t.line,
                }}
              >
                <Text style={{ color: t.ink, fontSize: 15, fontFamily: sans.med, flexShrink: 1, marginRight: 12 }}>
                  {it.name}
                </Text>
                <Text style={{ color: t.gold, fontSize: 15, fontFamily: sans.bold }}>{it.price}</Text>
              </View>
            ))}

            <Pressable
              onPress={() => Linking.openURL(ad.url)}
              style={{
                marginTop: 18,
                height: 50,
                borderRadius: 14,
                backgroundColor: t.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontFamily: sans.bold, fontSize: 15 }}>View full circular →</Text>
            </Pressable>

            <Text style={{ color: t.inkFaint, fontSize: 12, marginTop: 14, lineHeight: 18, fontFamily: sans.med }}>
              Sale prices are set by the store and effective {ad.effective}.
              {ad.highlights.length ? ' Highlights are a sample — tap above for the full flyer.' : ''}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export function NearbyStoreRow({ store }: { store: StoreWithDist }) {
  const { s } = useUI();
  const cheap = cheapestAt(store.id);
  return (
    <View style={s.nStore}>
      <View style={s.nStoreMid}>
        <Text style={s.nStoreName}>{store.name}</Text>
        <Text style={s.nStoreMeta}>{store.city}</Text>
        {cheap ? (
          <Text style={s.nStoreHint}>
            {cheap.label} from {money(cheap.price)}{unitSuffix(cheap.unit)}
          </Text>
        ) : store.note ? (
          <Text style={s.nStoreNote}>{store.note}</Text>
        ) : null}
      </View>
      <View style={s.nStoreRight}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.nMiles}>{store.miles.toFixed(1)}</Text>
          <Text style={s.nMilesUnit}>MILES</Text>
        </View>
        <StatusBadge status={store.status} />
      </View>
    </View>
  );
}
