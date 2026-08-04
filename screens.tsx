import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUI } from './ui';
import { useLocation } from './location';
import { useProfile } from './profile';
import { useBasket } from './basket';
import { useAuth } from './auth';
import { AnimatedMoney } from './anim';
import {
  CheapestChips,
  CompareRow,
  DealRow,
  FeedHeader,
  ListPicker,
  PillTabs,
  SearchBar,
  SettingsModal,
  StoreCard2,
} from './components';
import {
  areaCheapest,
  areaDeals,
  basketTotals,
  compRows,
  LIVE_CATEGORIES,
  money,
  STORE_ABBR,
  storeHasCategoryData,
  storeHasData,
  unitSuffix,
} from './data';
import { useData } from './datactx';
import { decodeList, shareText } from './share';
import { hasCatalog, searchCatalog } from './catalog';
import { areaStoreIds, KSTORES, storesNear } from './stores';
import { sans } from './theme';

const sansBold = sans.bold;
const sansMed = sans.med;
const sansSemi = sans.semi;

/* ---------- Prices (main): pick a category → every item compared ---------- */
export function PricesScreen() {
  const { s } = useUI();
  const { origin, maxMiles } = useLocation();
  const { updatedAt } = useData();
  const [cat, setCat] = useState('chicken');
  const [q, setQ] = useState('');
  const [showDeals, setShowDeals] = useState(false);
  const query = q.trim().toLowerCase();

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

  return (
    <View style={s.root}>
      <FeedHeader onDeals={() => setShowDeals(true)} />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 36, paddingTop: 4 }}>
        <SearchBar value={q} onChange={setQ} />
        <Text style={[s.listHint, { marginBottom: 2 }]}>Prices updated {updatedAt}</Text>

        {!query ? (
          <View style={{ marginTop: 4 }}>
            <PillTabs value={cat} onChange={setCat} options={LIVE_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))} />
          </View>
        ) : null}

        {blocks.map((b) => {
          // With 2+ stores, lead with real head-to-heads; tuck items only one store
          // carries into a quiet "Only at one store" group (no wall of dashes).
          const priced = (r: (typeof b.rows)[number]) => r.prices.filter((p) => p != null).length;
          const split = b.ids.length >= 2;
          const cmp = split ? b.rows.filter((r) => priced(r) >= 2) : b.rows;
          const solo = split ? b.rows.filter((r) => priced(r) < 2) : [];
          return (
            <View key={b.cat.key}>
              <Text style={s.listHint}>
                {b.cat.label} · {b.ids.map((id) => STORE_ABBR[id] ?? id).join(' vs ')}
              </Text>
              <View style={{ paddingHorizontal: 18 }}>
                {cmp.map((r) => (
                  <CompareRow key={`${r.cat}-${r.id}`} item={r.item} unit={r.unit} storeIds={b.ids} prices={r.prices} />
                ))}
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
                          soloClean
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
                  item={h.name}
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
                  item={h.name}
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
  const deals = areaDeals(active);
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
  const { s } = useUI();
  const { origin, maxMiles } = useLocation();
  useData(); // re-render when the daily feed lands so the weekly-ad date updates
  const nearby = storesNear(origin, maxMiles);

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 36 }}>
        <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
          <Text style={s.h1clean}>Stores near you</Text>
        </View>
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
    </View>
  );
}

/* ---------- List: your active list + where the whole cart is cheapest ---------- */
export function ListScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const basket = useBasket();
  const [showTripAdd, setShowTripAdd] = useState(false);
  const active = areaStoreIds(origin, maxMiles).filter(storeHasData).slice(0, 3);
  // Saved list items + "just this trip" one-offs (deduped). Trip items are
  // priced into the cart but never written to the saved list.
  const savedKeys = new Set(basket.items.map((i) => `${i.cat}:${i.id}`));
  const tripItems = basket.tempItems.filter((i) => !savedKeys.has(`${i.cat}:${i.id}`));
  const tripKeys = new Set(tripItems.map((i) => `${i.cat}:${i.id}`));
  const allItems = [...basket.items, ...tripItems];
  const res = basketTotals(allItems, active);
  const empty = allItems.length === 0;

  // Lead with items your nearby stores actually price; tuck the rest into a quiet
  // "not sold near you" group so the list doesn't read as half-empty.
  const pricedLines = res.lines.filter((l) => l.cheapestIdx >= 0);
  const unpricedLines = res.lines.filter((l) => l.cheapestIdx < 0);
  const renderLine = (ln: (typeof res.lines)[number], muted = false) => {
    const best = ln.cheapestIdx >= 0 ? ln.prices[ln.cheapestIdx] : null;
    const bestStore = ln.cheapestIdx >= 0 ? STORE_ABBR[active[ln.cheapestIdx]] ?? active[ln.cheapestIdx] : null;
    const isTrip = tripKeys.has(`${ln.cat}:${ln.id}`);
    return (
      <View
        key={`${ln.cat}-${ln.id}`}
        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.line }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: muted ? t.inkSoft : t.ink, fontSize: 15, fontFamily: sansBold, flexShrink: 1 }}>{ln.label}</Text>
            {isTrip ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: t.goldBg }}>
                <Text style={{ color: t.gold, fontSize: 10, fontFamily: sansBold, letterSpacing: 0.3 }}>THIS TRIP</Text>
              </View>
            ) : null}
          </View>
          {!muted ? (
            <Text style={{ color: t.inkSoft, fontSize: 12.5, marginTop: 2, fontFamily: sansMed }}>
              {best != null ? `${money(best)}${unitSuffix(ln.unit)} at ${bestStore}` : 'Not sold at these stores'}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => (isTrip ? basket.removeTemp(ln.cat, ln.id) : basket.remove(ln.cat, ln.id))}
          hitSlop={10}
          style={{ padding: 6 }}
        >
          <Text style={{ color: t.inkFaint, fontSize: 18 }}>✕</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 18,
            paddingTop: 6,
          }}
        >
          <Text style={s.h1clean}>Your list</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable
              onPress={() => {
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
                    itemLabels: res.lines.map((l) => l.label),
                  }),
                });
              }}
              hitSlop={8}
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
              <Text style={{ fontSize: 16, color: t.brand, marginTop: -1 }}>↗</Text>
            </Pressable>
            <ListPicker />
          </View>
        </View>
        <Text style={s.listHint}>
          {origin.label}
          {active.length ? ` · ${active.map((id) => STORE_ABBR[id] ?? id).join(' · ')}` : ''}
        </Text>

        {empty ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 40, marginTop: 40 }}>
            <Text style={{ fontSize: 44, marginBottom: 14 }}>🛒</Text>
            <Text style={{ color: t.inkSoft, fontSize: 15, textAlign: 'center', lineHeight: 22, fontFamily: sansMed }}>
              This list is empty.{'\n'}Go to the Account tab to add items.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 18, marginTop: 8 }}>
            {/* Cheapest-cart summary, shopping-forward */}
            {res.cheapest ? (
              <View
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
              </View>
            ) : null}

            {pricedLines.map((ln) => renderLine(ln))}

            {unpricedLines.length ? (
              <>
                <Text style={{ marginTop: 16, marginBottom: 4, fontSize: 13, color: t.inkFaint, fontFamily: sansSemi }}>
                  Not sold at your nearby stores
                </Text>
                {unpricedLines.map((ln) => renderLine(ln, true))}
              </>
            ) : null}
          </View>
        )}

        {/* Add a one-off item just for this shopping trip (doesn't save to the list) */}
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
          <Text style={{ color: t.brand, fontSize: 14.5, fontFamily: sansBold }}>Add an item (just this trip)</Text>
        </Pressable>
      </ScrollView>
      <AddItemsModal visible={showTripAdd} onClose={() => setShowTripAdd(false)} storeIds={active} temp />
    </View>
  );
}

/* ---------- Account: personal home + a tappable list of your lists ---------- */
export function AccountScreen() {
  const { s, t } = useUI();
  const { origin, maxMiles } = useLocation();
  const { name } = useProfile();
  const basket = useBasket();
  const { user, configured } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showRegAdd, setShowRegAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  const openList = (id: string) => {
    basket.setActive(id);
    setShowAdd(true);
  };

  return (
    <View style={s.root}>
      <FeedHeader />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
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
                      {ln.label}
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
        <View style={{ paddingHorizontal: 18, gap: 10 }}>
          {basket.lists.map((l) => {
            const cheapest = listRes.get(l.id)?.cheapest ?? null;
            const nItems = `${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}`;
            return (
              <Pressable
                key={l.id}
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
                <Text style={{ color: t.inkFaint, fontSize: 24, fontFamily: sansMed }}>›</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setShowCreate(true)} style={{ alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, marginTop: 2 }}>
          <Text style={{ color: t.brand, fontSize: 14, fontFamily: sansBold }}>+ New list</Text>
        </Pressable>

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
      <AddItemsModal visible={showAdd} onClose={() => setShowAdd(false)} storeIds={active} />
      <CreateListModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          setShowAdd(true); // jump straight into adding items to the new list
        }}
      />
      <AddItemsModal visible={showRegAdd} onClose={() => setShowRegAdd(false)} storeIds={active} regular />
      <SettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

/* (Unused) paste a shared-list code → loads it as a new list. Kept in case
   import is wanted later; not surfaced in the UI. */
export function ImportListModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { s, t } = useUI();
  const basket = useBasket();
  const [text, setText] = useState('');
  const [err, setErr] = useState(false);

  const doImport = () => {
    const parsed = decodeList(text);
    if (!parsed || !parsed.items.length) {
      setErr(true);
      return;
    }
    basket.importList(parsed);
    setText('');
    setErr(false);
    onClose();
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
              Paste the shared list (or its “kc1:…” code) below.
            </Text>

            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                setErr(false);
              }}
              placeholder="Paste here…"
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
                Couldn't read a list in that — make sure you pasted the whole message.
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
                    item={h.name}
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
                    item={h.name}
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
            <Pressable onPress={() => { basket.deleteList(basket.active.id); onClose(); }} style={{ alignSelf: 'center', marginTop: 26, padding: 8 }}>
              <Text style={{ color: t.oxblood, fontSize: 13, fontFamily: sansSemi }}>Delete this list</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
