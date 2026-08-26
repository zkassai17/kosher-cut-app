import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUI } from './ui';
import { useLocation } from './location';
import { useProfile } from './profile';
import { useBasket } from './basket';
import { useAuth } from './auth';
import { track } from './track';
import { AnimatedMoney } from './anim';
import {
  BrandDetailModal,
  CheapestChips,
  CompareRow,
  DealRow,
  FeedHeader,
  ListOptionsSheet,
  ListPicker,
  PillTabs,
  PreviewPickerModal,
  SearchBar,
  SettingsModal,
  StoreCard2,
} from './components';
import {
  areaCheapest,
  areaDeals,
  basketTotals,
  compRows,
  groupByStore,
  isPackagePriced,
  LIVE_CATEGORIES,
  money,
  STORE_ABBR,
  storeHasCategoryData,
  storeHasData,
  unitSuffix,
} from './data';
import { useData } from './datactx';
import { decodeList, encodeList, parseTextList, shareText } from './share';
import { BrandItem, brandFromPrice, brandsFor, cleanName, hasCatalog, searchCatalog } from './catalog';
import { areaStoreIds, KSTORES, storesNear } from './stores';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { CoachTarget, useTabCoach } from './coachmarks';
import { sans } from './theme';

const sansBold = sans.bold;
const sansMed = sans.med;
const sansSemi = sans.semi;

/* ---------- Prices (main): pick a category → every item compared ---------- */
export function PricesScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const { updatedAt } = useData();
  const [cat, setCat] = useState('chicken');
  const [q, setQ] = useState('');
  const [showDeals, setShowDeals] = useState(false);
  const [brandDetail, setBrandDetail] = useState<{ item: BrandItem; storeIds: string[]; title: string; subtitle: string } | null>(null);
  const query = q.trim().toLowerCase();
  useTabCoach('prices', useIsFocused());

  // Stores in the picked area that actually list a given category.
  const storesFor = (catKey: string) =>
    areaStoreIds(origin, maxMiles)
      .filter((id) => storeHasCategoryData(id, catKey))
      .slice(0, 3);

  // When searching, match across every category; otherwise show the selected one.
  const blocks = (query ? LIVE_CATEGORIES : LIVE_CATEGORIES.filter((c) => c.key === cat)).map((c) => {
    const ids = storesFor(c.key);
    const rows = compRows(c.key, ids).filter((r) => (query ? r.item.toLowerCase().includes(query) : true));
    return { cat: c, ids, rows };
  }).filter((b) => b.rows.length && b.ids.length);

  // Full-catalog search — every product a store carries (branded packaged goods,
  // e.g. "Salad Mate dressing"), not just the curated cuts. Only when searching.
  const catalogStores = query ? areaStoreIds(origin, maxMiles).filter(hasCatalog).slice(0, 4) : [];
  const catalogHits = query ? searchCatalog(query, catalogStores) : [];
  // Real head-to-heads (2+ stores) lead; items only one nearby store carries go
  // in a quiet section so they read as listings, not broken comparisons.
  const cmpHits = catalogHits.filter((h) => h.prices.length >= 2);
  const soloHits = catalogHits.filter((h) => h.prices.length < 2);
  const nothing = !blocks.length && !catalogHits.length;

  // ---- Analytics ----------------------------------------------------------
  // Keep the latest result count in a ref so the debounced search event can read
  // it without re-running the search.
  const resultCountRef = useRef(0);
  resultCountRef.current = blocks.reduce((n, b) => n + b.rows.length, 0) + catalogHits.length;
  // A search = a stabilized query (900ms after the last keystroke). Also logs a
  // demand signal when a search finds nothing.
  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(() => {
      const results = resultCountRef.current;
      track('search', { query, area: origin.areaId, results });
      if (results === 0) track('search_no_results', { query, area: origin.areaId });
    }, 900);
    return () => clearTimeout(timer);
  }, [query, origin.areaId]);
  // Demand signal: the user is in an area we don't cover with prices.
  const hasCoverage = areaStoreIds(origin, maxMiles).some((id) => storeHasData(id));
  useEffect(() => {
    if (!hasCoverage) track('area_uncovered', { area: origin.areaId });
  }, [origin.areaId, hasCoverage]);

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 36, paddingTop: 4 }}>
        <CoachTarget tab="prices" id="search">
          <SearchBar value={q} onChange={setQ} />
        </CoachTarget>
        <Text style={[s.listHint, { marginBottom: 2 }]}>Prices updated {updatedAt} · always confirm in-store</Text>

        {!query ? (
          <CoachTarget tab="prices" id="cats" style={{ marginTop: 4 }}>
            <PillTabs
              value={cat}
              onChange={setCat}
              options={LIVE_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
              trailing={
                <Pressable
                  onPress={() => {
                    track('deal_view');
                    setShowDeals(true);
                  }}
                  hitSlop={6}
                  style={[s.fchip, { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: t.goldBg, borderColor: t.gold }]}
                >
                  <Text style={{ fontSize: 13 }}>🔥</Text>
                  <Text style={[s.fchipText, { color: t.gold }]}>Deals</Text>
                </Pressable>
              }
            />
          </CoachTarget>
        ) : null}

        {blocks.map((b) => {
          // With 2+ stores, lead with real head-to-heads; tuck items only one store
          // carries into a quiet "Only at one store" group (no wall of dashes).
          // Count brand "from" prices too, so a store priced only via brands (e.g.
          // Nutmeg) is classified the same way it's displayed.
          const priced = (r: (typeof b.rows)[number]) =>
            b.ids.filter((sid, i) => (brandFromPrice(origin.areaId ?? '', r.id, sid) ?? r.prices[i]) != null).length;
          const split = b.ids.length >= 2;
          const cmp = split ? b.rows.filter((r) => priced(r) >= 2) : b.rows;
          const solo = split ? b.rows.filter((r) => priced(r) < 2) : [];
          return (
            <View key={b.cat.key}>
              <Text style={s.listHint}>
                {b.cat.label} · {b.ids.map((id) => STORE_ABBR[id] ?? id).join(' vs ')}
              </Text>
              <View style={{ paddingHorizontal: 18 }}>
                {cmp.map((r) => {
                  const key = `${r.cat}-${r.id}`;
                  const area = origin.areaId ?? '';
                  const bi = brandsFor(area, r.id);
                  const brandCount = bi ? bi.rows.filter((row) => b.ids.some((sid) => row.prices[sid] != null)).length : 0;
                  const hasBrands = !!bi && brandCount > 0;
                  // Decision A: collapsed row shows each store's cheapest-brand "from" price.
                  const prices = hasBrands
                    ? b.ids.map((sid, i) => brandFromPrice(area, r.id, sid) ?? r.prices[i])
                    : r.prices;
                  // The single cheapest brand across the shown stores — so the row
                  // says WHICH brand wins, not just a price.
                  let cheapBrand: { label: string; price: number; sid: string } | null = null;
                  if (hasBrands && bi) {
                    for (const row of bi.rows) {
                      for (const sid of b.ids) {
                        const p = row.prices[sid];
                        if (p != null && (cheapBrand == null || p < cheapBrand.price)) {
                          cheapBrand = { label: row.variant ? `${row.brand} ${row.variant}` : row.brand, price: p, sid };
                        }
                      }
                    }
                  }
                  const openDetail =
                    hasBrands && bi
                      ? () => {
                          setBrandDetail({
                            item: bi,
                            storeIds: b.ids,
                            title: r.item,
                            subtitle: `${brandCount} brands · ${b.ids.map((id) => STORE_ABBR[id] ?? id).join(' vs ')}`,
                          });
                          track('brand_open', { area: origin.areaId, item: r.id });
                        }
                      : undefined;
                  return (
                    <CompareRow
                      key={key}
                      // Title = the cheapest actual product ("Norman's cream cheese"); tap opens
                      // the full brand page.
                      item={hasBrands && cheapBrand ? `${cheapBrand.label} ${r.item.toLowerCase()}` : r.item}
                      unit={r.unit}
                      storeIds={b.ids}
                      prices={prices}
                      pkgFlags={b.ids.map((sid) => isPackagePriced(sid, b.cat.key))}
                      onPress={openDetail}
                      chevron={hasBrands}
                      stack
                    />
                  );
                })}
              </View>
              {solo.length ? (
                <>
                  <Text style={[s.listHint, { marginTop: 12 }]}>Only at one store</Text>
                  <View style={{ paddingHorizontal: 18 }}>
                    {solo.map((r) => {
                      const i = r.prices.findIndex((p) => p != null);
                      return (
                        <CompareRow
                          key={`${r.cat}-${r.id}`}
                          item={r.item}
                          unit={r.unit}
                          storeIds={[b.ids[i]]}
                          prices={[r.prices[i]]}
                          pkgFlags={[isPackagePriced(b.ids[i], b.cat.key)]}
                          soloClean
                          stack
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}

        {query && cmpHits.length ? (
          <>
            <Text style={s.listHint}>
              More products · {catalogStores.map((id) => STORE_ABBR[id] ?? id).join(' · ')}
            </Text>
            <View style={{ paddingHorizontal: 18 }}>
              {cmpHits.map((h) => (
                <CompareRow
                  key={h.name}
                  item={cleanName(h.name)}
                  unit={h.lb ? 'lb' : 'ea'}
                  storeIds={h.prices.map((p) => p.storeId)}
                  prices={h.prices.map((p) => p.price)}
                />
              ))}
            </View>
          </>
        ) : null}

        {query && soloHits.length ? (
          <>
            <Text style={[s.listHint, { marginTop: 14 }]}>Only at one store near you</Text>
            <View style={{ paddingHorizontal: 18 }}>
              {soloHits.map((h) => (
                <CompareRow
                  key={h.name}
                  item={cleanName(h.name)}
                  unit={h.lb ? 'lb' : 'ea'}
                  storeIds={h.prices.map((p) => p.storeId)}
                  prices={h.prices.map((p) => p.price)}
                  soloClean
                />
              ))}
            </View>
          </>
        ) : null}

        {nothing ? (
          <Text style={s.emptyLine}>
            {query
              ? `No items match "${q.trim()}" in ${origin.label}.`
              : `No stores with prices within ${maxMiles} mi of ${origin.label}.\n\nTap the city up top to switch areas or widen your distance.`}
          </Text>
        ) : null}
      </ScrollView>
      <DealsModal visible={showDeals} onClose={() => setShowDeals(false)} />
      <BrandDetailModal
        visible={!!brandDetail}
        onClose={() => setBrandDetail(null)}
        item={brandDetail?.item ?? null}
        storeIds={brandDetail?.storeIds ?? []}
        title={brandDetail?.title ?? ''}
        subtitle={brandDetail?.subtitle}
      />
    </View>
  );
}

/* ---------- Deals (modal opened from the Prices corner) ---------- */
export function DealsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const insets = useSafeAreaInsets();
  // Deals follow the location: same area stores as Prices — only ones we have
  // prices for (Cedar/Ma'adan are order-by-request, no data).
  const active = areaStoreIds(origin, maxMiles).filter(storeHasData).slice(0, 3);
  const deals = areaDeals(active, origin.areaId);
  const chips = areaCheapest(active);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}
        >
          <Text style={s.h1clean}>🔥 Deals</Text>
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

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 2 }}
        >
          {deals.length ? (
            <>
              <Text style={s.listHint}>
                Cheapest in {origin.label} · {active.map((id) => STORE_ABBR[id] ?? id).join(' vs ')}
              </Text>
              <CheapestChips chips={chips} />

              <Text style={s.listHint}>Biggest price gaps this week</Text>
              <View style={{ paddingHorizontal: 18 }}>
                {deals.map((d, i) => (
                  <DealRow key={`${d.cut}-${d.store}`} d={d} rank={i + 1} />
                ))}
              </View>
            </>
          ) : (
            <Text style={s.emptyLine}>
              No head-to-head deals in {origin.label} yet — we need at least two stores here pricing
              the same item. Tap the city up top to switch areas.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ---------- Stores ---------- */
export function StoresScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  useData(); // re-render when the daily feed lands so the weekly-ad date updates
  useTabCoach('stores', useIsFocused());
  const [showCustomize, setShowCustomize] = useState(false);
  const nearby = storesNear(origin, maxMiles);

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        <CoachTarget
          tab="stores"
          id="stores"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6 }}
        >
          <Text style={s.h1clean}>Stores near you</Text>
          <Pressable onPress={() => setShowCustomize(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="options-outline" size={16} color={t.brand} />
            <Text style={{ color: t.brand, fontSize: 13.5, fontFamily: sansBold }}>Customize</Text>
          </Pressable>
        </CoachTarget>
        <Text style={s.listHint}>
          {nearby.length} within {maxMiles} mi of {origin.label}
        </Text>
        {nearby.length ? (
          nearby.map((st) => <StoreCard2 key={st.id} store={st} />)
        ) : (
          <Text style={s.emptyLine}>
            No kosher stores within {maxMiles} mi — tap the location up top to widen your distance.
          </Text>
        )}
      </ScrollView>
      <PreviewPickerModal visible={showCustomize} onClose={() => setShowCustomize(false)} />
    </View>
  );
}

/* ---------- List: SHOP the active list — cheapest cart, quantities, check-off,
   and one-off "just for this trip" items. Editing what's SAVED on a list (adding
   items, rename, reset, delete) lives on the Account tab, not here. ---------- */
export function ListScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const basket = useBasket();
  const [showTripAdd, setShowTripAdd] = useState(false);
  const [listMode, setListMode] = useState<'one' | 'split'>('one'); // 1-store vs split-by-store
  useTabCoach('list', useIsFocused());
  const active = areaStoreIds(origin, maxMiles).filter(storeHasData).slice(0, 3);
  // Saved list items + "just this trip" one-offs (deduped). Trip items are
  // priced into the cart but never written to the saved list.
  const savedKeys = new Set(basket.items.map((i) => `${i.cat}:${i.id}`));
  const tripItems = basket.tempItems.filter((i) => !savedKeys.has(`${i.cat}:${i.id}`));
  const tripKeys = new Set(tripItems.map((i) => `${i.cat}:${i.id}`));
  const allItems = [...basket.items, ...tripItems];
  const res = basketTotals(allItems, active);
  const empty = allItems.length === 0;

  // Shopping split: what's still to buy on top (priced first, then not-sold-nearby),
  // checked-off items dim and drop below a "Got it" divider.
  const toBuy = res.lines.filter((l) => !basket.isGot(l.cat, l.id));
  const gotLines = res.lines.filter((l) => basket.isGot(l.cat, l.id));
  const toBuyPriced = toBuy.filter((l) => l.cheapestIdx >= 0);
  const toBuyUnpriced = toBuy.filter((l) => l.cheapestIdx < 0);

  // Split-by-store plan: each item under its cheapest store, with subtotals.
  const split = groupByStore(res, active);
  const storeName = (id: string) => KSTORES.find((k) => k.id === id)?.name ?? STORE_ABBR[id] ?? id;

  const stepBtn = {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  const roundBtn = {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.line,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  const renderLine = (ln: (typeof res.lines)[number], got = false, hideStore = false) => {
    const best = ln.cheapestIdx >= 0 ? ln.prices[ln.cheapestIdx] : null;
    const bestStore = ln.cheapestIdx >= 0 ? STORE_ABBR[active[ln.cheapestIdx]] ?? active[ln.cheapestIdx] : null;
    const isTrip = tripKeys.has(`${ln.cat}:${ln.id}`);
    const setQ = (n: number) => (isTrip ? basket.setTempQty(ln.cat, ln.id, n) : basket.setQty(ln.cat, ln.id, n));
    return (
      <View
        key={`${ln.cat}-${ln.id}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.line }}
      >
        {/* "Got it" checkbox */}
        <Pressable
          onPress={() => basket.toggleGot(ln.cat, ln.id)}
          hitSlop={8}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: got ? t.brand : t.line,
            backgroundColor: got ? t.brand : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {got ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
        </Pressable>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={2}
              style={{
                color: got ? t.inkFaint : t.ink,
                fontSize: 15,
                fontFamily: sansBold,
                flexShrink: 1,
                textDecorationLine: got ? 'line-through' : 'none',
              }}
            >
              {cleanName(ln.label)}
            </Text>
            {isTrip ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: t.goldBg }}>
                <Text style={{ color: t.gold, fontSize: 10, fontFamily: sansBold, letterSpacing: 0.3 }}>THIS TRIP</Text>
              </View>
            ) : null}
          </View>
          {!got ? (
            <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 2, fontFamily: sansMed }}>
              {best != null
                ? `${money(best)}${unitSuffix(ln.unit)}${hideStore ? '' : ` at ${bestStore}`}${ln.qty > 1 ? `  ·  ${ln.qty} = ${money(best * ln.qty)}` : ''}`
                : 'Not sold at these stores'}
            </Text>
          ) : null}
        </View>

        {/* Quantity stepper — minus at 1 removes the item */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Pressable onPress={() => setQ(ln.qty - 1)} hitSlop={6} style={stepBtn}>
            {ln.qty <= 1 ? (
              <Ionicons name="trash-outline" size={15} color={t.inkFaint} />
            ) : (
              <Text style={{ color: t.ink, fontSize: 19, fontFamily: sansBold, marginTop: -3 }}>−</Text>
            )}
          </Pressable>
          <Text style={{ minWidth: 22, textAlign: 'center', color: t.ink, fontSize: 15, fontFamily: sansBold }}>{ln.qty}</Text>
          <Pressable onPress={() => setQ(ln.qty + 1)} hitSlop={6} style={stepBtn}>
            <Text style={{ color: t.ink, fontSize: 17, fontFamily: sansBold, marginTop: -1 }}>+</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const shareList = () => {
    const c = res.cheapest;
    const storeLine = c
      ? `Cheapest at ${KSTORES.find((k) => k.id === c.storeId)?.name ?? c.storeId} — about ${money(c.total)}` +
        (c.missing > 0 ? ` (${c.missing} item${c.missing > 1 ? 's' : ''} not sold there)` : '')
      : undefined;
    Share.share({
      message: shareText({
        label: basket.active.label,
        emoji: basket.active.emoji,
        storeLine,
        itemLabels: res.lines.map((l) => (l.qty > 1 ? `${cleanName(l.label)} ×${l.qty}` : cleanName(l.label))),
        code: encodeList({ label: basket.active.label, emoji: basket.active.emoji, items: basket.items }),
      }),
    });
    track('list_share', { list: basket.active.id, where: 'list' });
  };

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* One control row: mode toggle (compact) + list picker + share. */}
        <CoachTarget tab="list" id="toggle" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 2 }}>
          {!empty ? (
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                backgroundColor: t.surface,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: t.line,
                padding: 2.5,
              }}
            >
              {(['one', 'split'] as const).map((m) => {
                const on = listMode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setListMode(m)}
                    style={{ flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: on ? t.brand : 'transparent', alignItems: 'center' }}
                  >
                    <Text numberOfLines={1} style={{ color: on ? '#fff' : t.inkSoft, fontSize: 12, fontFamily: sansBold }}>
                      {m === 'one' ? '1 store' : 'Split & save'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <ListPicker />
          <Pressable onPress={shareList} hitSlop={8} style={roundBtn}>
            <Ionicons name="paper-plane-outline" size={16} color={t.brand} style={{ marginLeft: -1 }} />
          </Pressable>
        </CoachTarget>

        {/* Area · stores caption. */}
        <Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 12.5, fontFamily: sansMed, paddingHorizontal: 18, paddingTop: 5, paddingBottom: 2 }}>
          {origin.label}
          {active.length ? ` · ${active.map((id) => STORE_ABBR[id] ?? id).join(' · ')}` : ''}
        </Text>

        {empty ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 40, marginTop: 40 }}>
            <Text style={{ fontSize: 44, marginBottom: 14 }}>🛒</Text>
            <Text style={{ color: t.inkSoft, fontSize: 15, textAlign: 'center', lineHeight: 22, fontFamily: sansMed }}>
              This list is empty.{'\n'}Add items from the Account tab.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 18, marginTop: 8 }}>
            {listMode === 'one' ? (
              <>
            {/* Cheapest-cart summary, shopping-forward */}
            {res.cheapest ? (
              <CoachTarget
                tab="list"
                id="cheapest"
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.brand,
                  backgroundColor: t.brandSoft,
                  padding: 16,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: t.inkSoft, fontSize: 12, fontFamily: sansSemi, letterSpacing: 0.4 }}>
                  CHEAPEST FOR YOUR WHOLE LIST
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                  <Text style={{ color: t.brand, fontFamily: sansBold, fontSize: 22 }}>
                    {STORE_ABBR[res.cheapest.storeId] ?? res.cheapest.storeId} ·{' '}
                  </Text>
                  <AnimatedMoney value={res.cheapest.total} style={{ color: t.brand, fontFamily: sansBold, fontSize: 22 }} />
                </View>
                {res.totals.length > 1 ? (
                  <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 4, fontFamily: sansMed }}>
                    vs {res.totals.slice(1).map((tt) => `${STORE_ABBR[tt.storeId] ?? tt.storeId} ${money(tt.total)}`).join('  ·  ')}
                  </Text>
                ) : null}
                {res.splitSavings > 0.001 ? (
                  <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 8, fontFamily: sansMed }}>
                    Split across stores to save{' '}
                    <Text style={{ color: t.brand, fontFamily: sansBold }}>{money(res.splitSavings)}</Text> more.
                  </Text>
                ) : null}
                <Text style={{ color: t.inkFaint, fontSize: 11.5, marginTop: 8, fontFamily: sansMed }}>
                  Estimate from the latest prices — confirm in-store.
                </Text>
              </CoachTarget>
            ) : null}

            {/* Progress: what's left to buy */}
            <Text style={{ fontSize: 12, color: t.inkSoft, fontFamily: sansSemi, letterSpacing: 0.4, marginTop: 4, marginBottom: 2 }}>
              {toBuy.length > 0 ? `TO BUY · ${toBuy.length} LEFT` : 'ALL CHECKED OFF ✓'}
            </Text>

            {toBuyPriced.map((ln) => renderLine(ln))}

            {toBuyUnpriced.length ? (
              <>
                <Text style={{ marginTop: 14, marginBottom: 2, fontSize: 13, color: t.inkFaint, fontFamily: sansSemi }}>
                  Not sold at your nearby stores
                </Text>
                {toBuyUnpriced.map((ln) => renderLine(ln))}
              </>
            ) : null}

            {gotLines.length ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 2 }}>
                  <Text style={{ fontSize: 12, color: t.brand, fontFamily: sansSemi, letterSpacing: 0.4 }}>GOT IT ✓</Text>
                  <Pressable onPress={() => basket.clearChecks()} hitSlop={8}>
                    <Text style={{ fontSize: 12.5, color: t.inkSoft, fontFamily: sansSemi }}>Uncheck all</Text>
                  </Pressable>
                </View>
                {gotLines.map((ln) => renderLine(ln, true))}
              </>
            ) : null}
              </>
            ) : (
              <>
                {res.splitSavings > 0.001 ? (
                  <View style={{ borderRadius: 14, borderWidth: 1, borderColor: t.brand, backgroundColor: t.brandSoft, padding: 14, marginBottom: 6 }}>
                    <Text style={{ color: t.inkSoft, fontSize: 12, fontFamily: sansSemi, letterSpacing: 0.4 }}>SPLIT ACROSS STORES</Text>
                    <Text style={{ color: t.ink, fontSize: 14, marginTop: 4, fontFamily: sansMed }}>
                      Total {money(res.splitTotal)} · save{' '}
                      <Text style={{ color: t.brand, fontFamily: sansBold }}>{money(res.splitSavings)}</Text> vs one store
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: t.inkSoft, fontSize: 13, marginBottom: 6, fontFamily: sansMed }}>
                    Each item at its cheapest nearby store.
                  </Text>
                )}
                {split.groups.map((g) => (
                  <View key={g.storeId}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 2 }}>
                      <Text style={{ fontSize: 13.5, color: t.ink, fontFamily: sansBold }}>{storeName(g.storeId)}</Text>
                      <Text style={{ fontSize: 13.5, color: t.brand, fontFamily: sansBold }}>{money(g.subtotal)}</Text>
                    </View>
                    {g.lines.map(({ line }) => renderLine(line, basket.isGot(line.cat, line.id), true))}
                  </View>
                ))}
                {split.unpriced.length ? (
                  <>
                    <Text style={{ marginTop: 14, marginBottom: 2, fontSize: 13, color: t.inkFaint, fontFamily: sansSemi }}>
                      Not sold at your nearby stores
                    </Text>
                    {split.unpriced.map((line) => renderLine(line, basket.isGot(line.cat, line.id), true))}
                  </>
                ) : null}
              </>
            )}
          </View>
        )}

        {/* The List page only adds one-off items for THIS trip. To change what's
            saved on the list, use "+ Add" on the Account tab. */}
        <Pressable
          onPress={() => setShowTripAdd(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginHorizontal: 18,
            marginTop: empty ? 24 : 16,
            borderWidth: 1.5,
            borderColor: t.brand,
            borderStyle: 'dashed',
            borderRadius: 14,
            paddingVertical: 14,
          }}
        >
          <Text style={{ color: t.brand, fontSize: 18, fontFamily: sansBold, marginTop: -2 }}>+</Text>
          <Text style={{ color: t.brand, fontSize: 14.5, fontFamily: sansBold }}>Add just for this trip</Text>
        </Pressable>
        <Text style={{ color: t.inkFaint, fontSize: 12, textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 17, fontFamily: sansMed }}>
          To add items to this saved list, use “+ Add” on the Account tab.
        </Text>
      </ScrollView>
      <AddItemsModal visible={showTripAdd} onClose={() => setShowTripAdd(false)} storeIds={active} temp />
    </View>
  );
}

/* ---------- Account: personal home + a tappable list of your lists ---------- */
// Swipe a saved list to the RIGHT to reveal a trash button (built on RN's
// PanResponder — no gesture-handler dep). Disabled for preset lists (they can't
// be deleted). Deleting happens right here on the Account page, so you stay put.
function SwipeToDeleteRow({
  enabled,
  onDelete,
  children,
}: {
  enabled: boolean;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const { t } = useUI();
  const REVEAL = 72;
  const tx = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const snap = (to: number) => {
    open.current = to > 0;
    Animated.spring(tx, { toValue: to, useNativeDriver: false, bounciness: 6, speed: 20 }).start();
  };
  const wantsSwipe = (dx: number, dy: number) => enabled && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2;
  const pan = useRef(
    PanResponder.create({
      // Capture-phase so we win the horizontal drag BEFORE the inner Pressable /
      // the vertical ScrollView grab it. Taps (no move) pass through to the row.
      onMoveShouldSetPanResponder: (_e, g) => wantsSwipe(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_e, g) => wantsSwipe(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false, // don't let the ScrollView reclaim mid-swipe
      onPanResponderMove: (_e, g) => {
        const base = open.current ? REVEAL : 0;
        tx.setValue(Math.max(0, Math.min(REVEAL, base + g.dx)));
      },
      onPanResponderRelease: (_e, g) => {
        const base = open.current ? REVEAL : 0;
        snap(base + g.dx > REVEAL * 0.4 ? REVEAL : 0);
      },
      onPanResponderTerminate: () => snap(open.current ? REVEAL : 0),
    })
  ).current;

  if (!enabled) return <>{children}</>;
  return (
    <View>
      {/* Floating round delete button, revealed as the card slides right. */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: REVEAL, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable
          onPress={() => {
            snap(0);
            onDelete();
          }}
          hitSlop={10}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.oxblood, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </Pressable>
      </View>
      <Animated.View style={{ transform: [{ translateX: tx }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

export function AccountScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const { name } = useProfile();
  const basket = useBasket();
  const { user, configured } = useAuth();
  const insets = useSafeAreaInsets();
  const [showEditor, setShowEditor] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showRegAdd, setShowRegAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  useTabCoach('account', useIsFocused());
  const active = areaStoreIds(origin, maxMiles).filter(storeHasData).slice(0, 3);
  const regRes = basketTotals(basket.regulars, active); // per-regular cheapest-store pricing

  // Price every list once, up front — powers the per-row "cheapest cart" line and
  // the header savings roll-up. Cheap: a handful of items × 3 stores per list.
  const listRes = new Map(basket.lists.map((l) => [l.id, basketTotals(l.items, active)]));
  const totalItems = basket.lists.reduce((n, l) => n + l.items.length, 0);
  // Honest account-level "you save": per list, the gap between the cheapest and the
  // priciest store that carries the WHOLE list (missing===0) — apples to apples, so
  // no store looks cheap just because it's missing items. Summed across lists.
  const accountSaved = basket.lists.reduce((sum, l) => {
    const complete = (listRes.get(l.id)?.totals ?? []).filter((tt) => tt.missing === 0);
    return complete.length >= 2 ? sum + (complete[complete.length - 1].total - complete[0].total) : sum;
  }, 0);
  const initial = (name?.trim()?.[0] ?? '').toUpperCase();

  // Tapping a list opens its editor right here on Account — see the items, change
  // quantities, remove, or add more. (Shopping the list lives on the List tab.)
  const openList = (id: string) => {
    basket.setActive(id);
    track('list_open', { list: id });
    setShowEditor(true);
  };

  // Send a list to a friend — readable items + an import code (they can pull it
  // straight into the app) + an invite link for anyone who doesn't have koshercart.
  const shareListById = (l: (typeof basket.lists)[number]) => {
    const r = listRes.get(l.id);
    const c = r?.cheapest ?? null;
    const storeLine = c ? `Cheapest at ${KSTORES.find((k) => k.id === c.storeId)?.name ?? c.storeId} — about ${money(c.total)}` : undefined;
    Share.share({
      message: shareText({
        label: l.label,
        emoji: l.emoji,
        storeLine,
        itemLabels: (r?.lines ?? []).map((ln) => (ln.qty > 1 ? `${cleanName(ln.label)} ×${ln.qty}` : cleanName(ln.label))),
        code: encodeList({ label: l.label, emoji: l.emoji, items: l.items }),
      }),
    });
    track('list_share', { list: l.id, where: 'account' });
  };

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {/* Personal header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 8 }}>
          <View
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}
          >
            {initial ? (
              <Text style={{ fontSize: 19, color: '#fff', fontFamily: sansBold }}>{initial}</Text>
            ) : (
              <Text style={{ fontSize: 20 }}>👋</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.h1clean} numberOfLines={1}>{name ? `Hi, ${name}` : 'Your account'}</Text>
            <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 2, fontFamily: sansMed }}>
              {accountSaved > 0.5
                ? `Cheapest stores save you ~${money(accountSaved)}`
                : `${totalItems} ${totalItems === 1 ? 'item' : 'items'} across ${basket.lists.length} ${basket.lists.length === 1 ? 'list' : 'lists'}`}
            </Text>
          </View>
          <Pressable onPress={() => setShowSettings(true)} hitSlop={12} style={{ padding: 4 }}>
            <Ionicons name="settings-outline" size={24} color={t.inkSoft} />
          </Pressable>
        </View>

        {/* My Regulars — the products you always buy, watched for the best price */}
        <Text style={s.listHint}>MY REGULARS</Text>
        {basket.regulars.length === 0 ? (
          <View style={{ paddingHorizontal: 18 }}>
            <Pressable
              onPress={() => setShowRegAdd(true)}
              style={{
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: t.brand,
                borderStyle: 'dashed',
                borderRadius: 14,
                paddingVertical: 18,
                paddingHorizontal: 20,
              }}
            >
              <Text style={{ color: t.brand, fontSize: 15, fontFamily: sansBold }}>+ Add a regular</Text>
              <Text style={{ color: t.inkSoft, fontSize: 12.5, textAlign: 'center', marginTop: 4, fontFamily: sansMed }}>
                Your yogurt, bread, staples — see where each is cheapest.
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 18, gap: 10 }}>
            {regRes.lines.map((ln) => {
              const valid = ln.prices
                .map((p, i) => (p != null ? { store: active[i], price: p } : null))
                .filter((x): x is { store: string; price: number } => x != null)
                .sort((a, b) => a.price - b.price);
              const cheapest = valid[0];
              const save = valid.length >= 2 ? valid[1].price - valid[0].price : 0;
              return (
                <View
                  key={`${ln.cat}-${ln.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: t.surface,
                    borderWidth: 1,
                    borderColor: t.line,
                    borderRadius: 14,
                    padding: 13,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15, fontFamily: sansBold }} numberOfLines={2}>
                      {cleanName(ln.label)}
                    </Text>
                    {cheapest ? (
                      <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 3, fontFamily: sansMed }}>
                        Cheapest at{' '}
                        <Text style={{ color: t.brand, fontFamily: sansBold }}>
                          {STORE_ABBR[cheapest.store] ?? cheapest.store} {money(cheapest.price)}
                          {unitSuffix(ln.unit)}
                        </Text>
                        {valid.length >= 2
                          ? `  ·  vs ${STORE_ABBR[valid[1].store] ?? valid[1].store} ${money(valid[1].price)}`
                          : ''}
                      </Text>
                    ) : (
                      <Text style={{ color: t.inkFaint, fontSize: 12.5, marginTop: 3, fontFamily: sansMed }}>
                        Not sold at your stores
                      </Text>
                    )}
                  </View>
                  {save > 0.001 ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, backgroundColor: t.brandSoft }}>
                      <Text style={{ color: t.brand, fontSize: 12, fontFamily: sansBold }}>save {money(save)}</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => basket.removeRegular(ln.cat, ln.id)} hitSlop={10} style={{ padding: 4 }}>
                    <Text style={{ color: t.inkFaint, fontSize: 17 }}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
        {basket.regulars.length > 0 ? (
          <Pressable onPress={() => setShowRegAdd(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text style={{ color: t.brand, fontSize: 14, fontFamily: sansBold }}>+ Add a regular</Text>
          </Pressable>
        ) : null}

        {/* Lists */}
        <Text style={s.listHint}>YOUR LISTS</Text>
        <CoachTarget tab="account" id="lists" style={{ paddingHorizontal: 18, gap: 10 }}>
          {basket.lists.map((l) => {
            const cheapest = listRes.get(l.id)?.cheapest ?? null;
            const nItems = `${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}`;
            return (
              <SwipeToDeleteRow
                key={l.id}
                enabled={basket.lists.length > 1}
                onDelete={() =>
                  Alert.alert('Delete list', `Delete “${l.label}”? This can't be undone.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => basket.deleteList(l.id) },
                  ])
                }
              >
              <Pressable
                onPress={() => openList(l.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  backgroundColor: t.surface,
                  borderWidth: 1,
                  borderColor: t.line,
                  borderRadius: 14,
                  padding: 13,
                }}
              >
                <View
                  style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 23 }}>{l.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 16, fontFamily: sansBold }}>{l.label}</Text>
                  <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 2, fontFamily: sansMed }} numberOfLines={1}>
                    {cheapest ? (
                      <>
                        {nItems} · cheapest{' '}
                        <Text style={{ color: t.brand, fontFamily: sansBold }}>
                          {money(cheapest.total)} at {STORE_ABBR[cheapest.storeId] ?? cheapest.storeId}
                        </Text>
                      </>
                    ) : (
                      nItems
                    )}
                  </Text>
                </View>
                <Pressable
                  onPress={() => shareListById(l)}
                  hitSlop={8}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="paper-plane-outline" size={17} color={t.brand} style={{ marginLeft: -1 }} />
                </Pressable>
                <Text style={{ color: t.inkFaint, fontSize: 24, fontFamily: sansMed }}>›</Text>
              </Pressable>
              </SwipeToDeleteRow>
            );
          })}
        </CoachTarget>
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 18, marginTop: 12 }}>
          <Pressable
            onPress={() => setShowCreate(true)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              paddingVertical: 13,
              borderRadius: 14,
              backgroundColor: t.brand,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" style={{ marginTop: -1 }} />
            <Text style={{ color: '#fff', fontSize: 14.5, fontFamily: sansBold }}>New list</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowImport(true)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              paddingVertical: 13,
              borderRadius: 14,
              backgroundColor: t.brandSoft,
              borderWidth: 1,
              borderColor: t.line,
            }}
          >
            <Ionicons name="download-outline" size={16} color={t.brand} />
            <Text style={{ color: t.brand, fontSize: 14.5, fontFamily: sansBold }}>Import list</Text>
          </Pressable>
        </View>

        {configured && user ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 26, paddingHorizontal: 34 }}>
            <Ionicons name="cloud-done-outline" size={15} color={t.brand} />
            <Text style={{ color: t.inkSoft, fontSize: 12.5, fontFamily: sansMed }} numberOfLines={1}>
              Synced to {user.email ?? 'your account'}
            </Text>
          </View>
        ) : (
          <Text
            style={{ color: t.inkFaint, fontSize: 12, textAlign: 'center', marginTop: 26, paddingHorizontal: 34, lineHeight: 18, fontFamily: sansMed }}
          >
            Your lists are saved on this device.
          </Text>
        )}
      </ScrollView>
      <ListEditorModal visible={showEditor} onClose={() => setShowEditor(false)} storeIds={active} />
      <CreateListModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          setShowEditor(true); // open the new list's editor to build it
        }}
      />
      <AddItemsModal visible={showRegAdd} onClose={() => setShowRegAdd(false)} storeIds={active} regular />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <ImportListModal visible={showImport} onClose={() => setShowImport(false)} />
    </View>
  );
}

/* Account → tap a list → edit it here: see the items, change quantities, remove,
   or add more. This is the ONE place to edit what's saved on a list. No "just for
   this trip" here — that's a shopping action, so it lives only on the List tab. */
export function ListEditorModal({
  visible,
  onClose,
  storeIds,
}: {
  visible: boolean;
  onClose: () => void;
  storeIds: string[];
}) {
  const { s, t } = useUI();
  const basket = useBasket();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const res = basketTotals(basket.items, storeIds); // the active list's saved items
  const empty = basket.items.length === 0;

  const stepBtn = {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}>
          <Text style={[s.h1clean, { flexShrink: 1, marginRight: 12 }]} numberOfLines={1}>
            {basket.active.emoji} {basket.active.label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => setShowOptions(true)}
              hitSlop={8}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={t.inkSoft} />
            </Pressable>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{ paddingHorizontal: 16, height: 34, borderRadius: 17, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, color: '#fff', fontFamily: sansBold }}>Done</Text>
            </Pressable>
          </View>
        </View>
        <Text style={s.listHint}>Your list — change quantities, remove, or add more.</Text>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 2 }}>
          {empty ? (
            <Text style={s.emptyLine}>No items yet — tap “+ Add items” below.</Text>
          ) : (
            <View style={{ paddingHorizontal: 18 }}>
              {res.lines.map((ln) => {
                const best = ln.cheapestIdx >= 0 ? ln.prices[ln.cheapestIdx] : null;
                const bestStore = ln.cheapestIdx >= 0 ? STORE_ABBR[storeIds[ln.cheapestIdx]] ?? storeIds[ln.cheapestIdx] : null;
                return (
                  <View
                    key={`${ln.cat}-${ln.id}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.line }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ color: t.ink, fontSize: 15, fontFamily: sansBold }}>
                        {cleanName(ln.label)}
                      </Text>
                      <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 2, fontFamily: sansMed }}>
                        {best != null
                          ? `${money(best)}${unitSuffix(ln.unit)} at ${bestStore}${ln.qty > 1 ? `  ·  ${ln.qty} = ${money(best * ln.qty)}` : ''}`
                          : 'Not sold at these stores'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Pressable onPress={() => basket.setQty(ln.cat, ln.id, ln.qty - 1)} hitSlop={6} style={stepBtn}>
                        {ln.qty <= 1 ? (
                          <Ionicons name="trash-outline" size={15} color={t.inkFaint} />
                        ) : (
                          <Text style={{ color: t.ink, fontSize: 19, fontFamily: sansBold, marginTop: -3 }}>−</Text>
                        )}
                      </Pressable>
                      <Text style={{ minWidth: 22, textAlign: 'center', color: t.ink, fontSize: 15, fontFamily: sansBold }}>{ln.qty}</Text>
                      <Pressable onPress={() => basket.setQty(ln.cat, ln.id, ln.qty + 1)} hitSlop={6} style={stepBtn}>
                        <Text style={{ color: t.ink, fontSize: 17, fontFamily: sansBold, marginTop: -1 }}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Pressable
            onPress={() => setShowAdd(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginHorizontal: 18,
              marginTop: 18,
              borderWidth: 1.5,
              borderColor: t.brand,
              borderStyle: 'dashed',
              borderRadius: 14,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: t.brand, fontSize: 18, fontFamily: sansBold, marginTop: -2 }}>+</Text>
            <Text style={{ color: t.brand, fontSize: 14.5, fontFamily: sansBold }}>Add items</Text>
          </Pressable>
        </ScrollView>
      </View>
      <AddItemsModal visible={showAdd} onClose={() => setShowAdd(false)} storeIds={storeIds} />
      <ListOptionsSheet visible={showOptions} onClose={() => setShowOptions(false)} />
    </Modal>
  );
}

/* (Unused) paste a shared-list code → loads it as a new list. Kept in case
   import is wanted later; not surfaced in the UI. */
export function ImportListModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, t } = useUI();
  const basket = useBasket();
  const [text, setText] = useState('');
  const [err, setErr] = useState(false);

  const finish = () => {
    setText('');
    setErr(false);
    onClose();
  };

  const doImport = () => {
    // 1) A koshercart share code (kc1:…) → rebuild the exact shared list.
    const coded = decodeList(text);
    if (coded && coded.items.length) {
      basket.importList(coded);
      finish();
      return;
    }
    // 2) A plain typed/pasted list → match each line to what koshercart tracks.
    const parsed = parseTextList(text);
    if (parsed.items.length) {
      basket.importList({ label: 'Imported list', emoji: '🛒', items: parsed.items });
      finish();
      if (parsed.unmatched.length) {
        Alert.alert(
          `Added ${parsed.items.length} item${parsed.items.length > 1 ? 's' : ''}`,
          `Couldn't find: ${parsed.unmatched.slice(0, 8).join(', ')}${parsed.unmatched.length > 8 ? '…' : ''}.\n\nkoshercart compares staple grocery items — those aren't tracked yet.`
        );
      }
      return;
    }
    setErr(true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={() => {}}
            style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: t.line }}
          >
            <Text style={s.modalTitle}>Import a list</Text>
            <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 2, fontFamily: sansMed }}>
              Type your items — one per line — or paste a shared koshercart list.
            </Text>

            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                setErr(false);
              }}
              placeholder={'e.g.\nChicken cutlets\nGround beef\nMilk\nEggs\nKetchup'}
              placeholderTextColor={t.inkFaint}
              multiline
              autoFocus
              style={{
                minHeight: 96,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: err ? t.oxblood : t.line,
                backgroundColor: t.surface2,
                padding: 12,
                marginTop: 14,
                color: t.ink,
                fontSize: 14,
                fontFamily: sansMed,
                textAlignVertical: 'top',
              }}
            />
            {err ? (
              <Text style={{ color: t.oxblood, fontSize: 12.5, marginTop: 6, fontFamily: sansMed }}>
                Couldn't match any items — type one per line (e.g. Milk, Chicken cutlets, Ketchup).
              </Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable
                onPress={onClose}
                style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: t.inkSoft, fontFamily: sansBold, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={doImport}
                disabled={!text.trim()}
                style={{
                  flex: 2,
                  height: 50,
                  borderRadius: 14,
                  backgroundColor: t.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: text.trim() ? 1 : 0.45,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: sansBold, fontSize: 15 }}>Import list</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Modal to name a new custom list + pick an emoji, then start adding items. */
export function CreateListModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { s, t } = useUI();
  const basket = useBasket();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🛒');
  const EMOJIS = ['🛒', '🍎', '🍗', '🥩', '🧀', '🐟', '🍞', '🥗', '🎉', '🕯️', '🍷', '🔥', '🍰', '☕', '🥧', '🍫'];

  const create = () => {
    if (!name.trim()) return;
    basket.createList(name, emoji);
    setName('');
    setEmoji('🛒');
    onCreated();
  };

  const label = { color: t.inkSoft, fontSize: 12, fontFamily: sansSemi, letterSpacing: 0.4, marginTop: 16, marginBottom: 8 };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: t.surface,
              borderRadius: 20,
              padding: 20,
              borderWidth: 1,
              borderColor: t.line,
            }}
          >
            <Text style={s.modalTitle}>New list</Text>
            <Text style={{ color: t.inkSoft, fontSize: 13, marginTop: 2, fontFamily: sans.med }}>
              Name it and pick an emoji.
            </Text>

            <Text style={label}>NAME</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Weekly, Yom Tov, Costco run"
              placeholderTextColor={t.inkFaint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={create}
              style={{
                height: 48,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.surface2,
                paddingHorizontal: 14,
                color: t.ink,
                fontSize: 16,
                fontFamily: sans.med,
              }}
            />

            <Text style={label}>EMOJI</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            >
              {EMOJIS.map((e) => {
                const on = e === emoji;
                return (
                  <Pressable
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? t.brandSoft : t.surface2,
                      borderWidth: 1.5,
                      borderColor: on ? t.brand : t.line,
                    }}
                  >
                    <Text style={{ fontSize: 24 }}>{e}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
              <Pressable
                onPress={onClose}
                style={{
                  flex: 1,
                  height: 50,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: t.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: t.inkSoft, fontFamily: sansBold, fontSize: 15 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={create}
                disabled={!name.trim()}
                style={{
                  flex: 2,
                  height: 50,
                  borderRadius: 14,
                  backgroundColor: t.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: name.trim() ? 1 : 0.45,
                }}
              >
                <Text style={{ color: '#fff', fontFamily: sansBold, fontSize: 15 }}>{emoji}  Create & add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* Modal to add items to the active list — pick a category, tap items to add/remove.
   This is where list-building lives now (kept off the Prices tab). */
export function AddItemsModal({
  visible,
  onClose,
  storeIds,
  temp,
  regular,
}: {
  visible: boolean;
  onClose: () => void;
  storeIds: string[];
  temp?: boolean; // true = adds "just for this trip" items (from the List tab)
  regular?: boolean; // true = toggles "My Regulars" (watched products)
}) {
  const { s, t } = useUI();
  const basket = useBasket();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [cat, setCat] = useState('chicken');
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const custom = !temp && !regular && !basket.isPreset(basket.active.id);

  // Each mode toggles a different target: regulars, this-trip temp, or the list.
  const rowExtra = (c: string, i: string) =>
    regular
      ? { checked: basket.hasRegular(c, i), onToggle: () => basket.toggleRegular(c, i) }
      : temp
      ? {
          checked: basket.has(c, i) || basket.hasTemp(c, i),
          onToggle: () => {
            if (!basket.has(c, i)) basket.toggleTemp(c, i);
          },
        }
      : {};

  // Pick stores PER CATEGORY out of your shopping stores — like the Prices tab —
  // so a store that doesn't stock a category never appears as an empty "—" column
  // here (which reads as "missing"). Because it's a subset of the same stores the
  // List cart uses, the two screens can never disagree about what's available.
  const storesForCat = (catKey: string) => storeIds.filter((id) => storeHasCategoryData(id, catKey));
  // When searching, match items across every category; else the selected one.
  const blocks = (query ? LIVE_CATEGORIES : LIVE_CATEGORIES.filter((c) => c.key === cat))
    .map((c) => {
      const ids = storesForCat(c.key);
      return {
        cat: c,
        ids,
        rows: compRows(c.key, ids).filter((r) => (query ? r.item.toLowerCase().includes(query) : true)),
      };
    })
    .filter((b) => b.rows.length && b.ids.length);

  // Searching also reaches the FULL catalog, so you can add any product (a
  // specific dressing, dip, cereal…) to your list — not just the curated cuts.
  const catStores = query ? storeIds.filter(hasCatalog) : [];
  const catalogHits = query ? searchCatalog(query, catStores) : [];
  // Comparisons (2+ stores) lead; single-store items go in a clean section below
  // — shown as a plain price (their one store only), never with an empty dash.
  const cmpHits = catalogHits.filter((h) => h.prices.length >= 2);
  const soloHits = catalogHits.filter((h) => h.prices.length < 2);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 8 }]}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 }}
        >
          <Text style={[s.h1clean, { flexShrink: 1, marginRight: 12 }]}>
            {regular ? 'Add a regular' : temp ? 'Add for this trip' : `Add to ${basket.active.emoji} ${basket.active.label}`}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              paddingHorizontal: 16,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, color: '#fff', fontFamily: sansBold }}>Done</Text>
          </Pressable>
        </View>

        <SearchBar value={q} onChange={setQ} />
        <Text style={[s.listHint, { marginBottom: 4 }]}>Tap an item to add or remove it — green check = in your list.</Text>

        {!query ? (
          <View style={{ height: 50 }}>
            <PillTabs value={cat} onChange={setCat} options={LIVE_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))} />
          </View>
        ) : null}

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 30, paddingTop: 4 }}
        >
          {blocks.map((b) => {
            // Same split as the Prices tab: real head-to-heads (2+ stores) lead;
            // items only one store carries go in a clean "Only at one store" group
            // (shown as a plain price, never an empty dash).
            const priced = (r: (typeof b.rows)[number]) => r.prices.filter((p) => p != null).length;
            const split = b.ids.length >= 2;
            const cmp = split ? b.rows.filter((r) => priced(r) >= 2) : b.rows;
            const solo = split ? b.rows.filter((r) => priced(r) < 2) : [];
            return (
              <View key={b.cat.key}>
                {query ? <Text style={s.listHint}>{b.cat.label}</Text> : null}
                <View style={{ paddingHorizontal: 18 }}>
                  {cmp.map((r) => (
                    <CompareRow
                      key={`${r.cat}-${r.id}`}
                      item={r.item}
                      unit={r.unit}
                      cat={r.cat}
                      id={r.id}
                      storeIds={b.ids}
                      prices={r.prices}
                      pkgFlags={b.ids.map((sid) => isPackagePriced(sid, b.cat.key))}
                      {...rowExtra(r.cat, r.id)}
                    />
                  ))}
                </View>
                {solo.length ? (
                  <>
                    <Text style={[s.listHint, { marginTop: 10 }]}>Only at one store</Text>
                    <View style={{ paddingHorizontal: 18 }}>
                      {solo.map((r) => {
                        const i = r.prices.findIndex((p) => p != null);
                        return (
                          <CompareRow
                            key={`${r.cat}-${r.id}`}
                            item={r.item}
                            unit={r.unit}
                            cat={r.cat}
                            id={r.id}
                            storeIds={[b.ids[i]]}
                            prices={[r.prices[i]]}
                            pkgFlags={[isPackagePriced(b.ids[i], b.cat.key)]}
                            soloClean
                            {...rowExtra(r.cat, r.id)}
                          />
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </View>
            );
          })}

          {query && cmpHits.length ? (
            <>
              <Text style={s.listHint}>Other products</Text>
              <View style={{ paddingHorizontal: 18 }}>
                {cmpHits.map((h) => (
                  <CompareRow
                    key={h.name}
                    item={cleanName(h.name)}
                    unit={h.lb ? 'lb' : 'ea'}
                    cat="catalog"
                    id={h.name}
                    storeIds={storeIds}
                    prices={storeIds.map((sid) => h.prices.find((p) => p.storeId === sid)?.price ?? null)}
                    {...rowExtra('catalog', h.name)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {query && soloHits.length ? (
            <>
              <Text style={[s.listHint, { marginTop: 14 }]}>Only at one store near you</Text>
              <View style={{ paddingHorizontal: 18 }}>
                {soloHits.map((h) => (
                  <CompareRow
                    key={h.name}
                    item={cleanName(h.name)}
                    unit={h.lb ? 'lb' : 'ea'}
                    cat="catalog"
                    id={h.name}
                    storeIds={[h.prices[0].storeId]}
                    prices={[h.prices[0].price]}
                    soloClean
                    {...rowExtra('catalog', h.name)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {query && !blocks.length && !catalogHits.length ? (
            <Text style={s.emptyLine}>No items match “{q.trim()}”.</Text>
          ) : null}

          {custom ? (
            <Pressable onPress={() => { basket.deleteList(basket.active.id); onClose(); navigation.navigate('Account'); }} style={{ alignSelf: 'center', marginTop: 26, padding: 8 }}>
              <Text style={{ color: t.oxblood, fontSize: 13, fontFamily: sansSemi }}>Delete this list</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
