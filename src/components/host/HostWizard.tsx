import { Redirect, router, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { locateUser } from '@/platform/location';
import { takePhoto, type PhotoSource } from '@/platform/photos';
import { uploadPhoto } from '@/platform/upload';
import { ADDRESS_TYPES, DESTINATION_TYPES, isMassachusetts, searchAddresses, type GeocodedAddress } from '@/shared/adapters/addressSearch';
import { getMassachusettsResidentialRate } from '@/shared/adapters/eiaRates';
import { EV_MODELS } from '@/shared/data/evFallbackSeed';
import { CHARGER_KW_MAX, CHARGER_KW_MIN, DEFAULT_LOCAL_RATE, EARNINGS_CAP_MULTIPLE, L1_KW_MAX, L2_KW_MIN, MAX_LOCAL_RATE, MIN_LOCAL_RATE, SOLAR_KW_MAX, SUGGESTED_EARNINGS_HR } from '@/shared/engines/constants';
import type { Adapters, Plug } from '@/shared/engines/plug';
import { computePrice } from '@/shared/engines/pricing';
import { resolveRate, type RateResolution } from '@/shared/engines/rate';
import { FIELD_STEP, type ListingField } from '@/shared/features/host/validateListing';
import { DAY_LABELS, summarizeDays } from '@/shared/lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '@/shared/lib/format';
import { HOST_HOME_PATH, NEW_LISTING_PATH, SIGNUP_FOR_HOSTING_PATH } from '@/shared/lib/hostEntry';
import { MASSACHUSETTS_CENTER } from '@/shared/lib/mapbox';
import { isMassachusettsZip, stripHouseNumber } from '@/shared/lib/massachusetts';
import type { AvailabilityWindow, Level, Listing, SpotType } from '@/shared/types/listing';
import { useApp } from '@/state/AppState';
import { colors, fonts, radius, space, text } from '@/theme';
import Header from '../Header';
import { Pin } from '../Icons';
import SelectField from '../SelectField';
import { Button, CheckboxCard, ChoiceGroup, Pill, ReadOnlyField, Screen, Stepper, TextAreaField, TextField, TextLink, WarnNote } from '../ui';
import AddressAutocomplete from './AddressAutocomplete';
import PinPicker from './PinPicker';
import Wizard from './Wizard';

/**
 * Port of the web's src/pages/HostSignup.tsx: the six-step listing wizard. Same steps, rules, messages, rate lookup
 * and publishing (local in prototype mode; photo upload then PUT /me/listing with the backend). `edit` changes the
 * published listing in place and opens on Review.
 */

const STEPS = ['Your spot', 'Charger', 'Pricing', 'Photos & instructions', 'Availability', 'Review'];
const STEP_HEAD: { title: string; why: string }[] = [
  { title: 'Tell us about your spot', why: 'Drivers see the neighborhood first. The exact address is shared only after they book.' },
  { title: 'Describe your charger', why: 'The charger’s speed and plug decide which cars can use it and what they pay.' },
  { title: 'Set your pricing', why: 'Drivers pay for the power their car can draw, plus what you earn per hour.' },
  { title: 'Add photos and instructions', why: 'Good photos and clear directions help drivers find the spot without calling you.' },
  { title: 'Choose when it’s available', why: 'Windows are strict. A booking must fit inside one, so you never need to move a car.' },
  { title: 'Review and publish', why: 'Check everything once. You can edit any section from here.' },
];

const SPOT_TYPES: SpotType[] = ['Driveway', 'Garage', 'Carport', 'Private lot'];
const L2_PRESETS = [7.2, 7.7, 9.6, 11.5];
const L1_PRESETS = [1.44, 1.9];
const PRICE_TABLE_CARS = ['toyota-prius-prime', 'nissan-leaf', 'tesla-my'].map((id) => EV_MODELS.find((c) => c.id === id)!);
const MAX_PHOTOS = 8;
const LISTING_PHOTO_DIM = 800;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const PRESETS: { label: string; w: Omit<AvailabilityWindow, 'id'> }[] = [
  { label: '+ Weekdays 7 AM to 7 PM', w: { days: [0, 1, 2, 3, 4], start: 7, end: 19 } },
  { label: '+ Every day 8 AM to 8 PM', w: { days: [0, 1, 2, 3, 4, 5, 6], start: 8, end: 20 } },
  { label: '+ Overnight 8 PM to 8 AM', w: { days: [0, 1, 2, 3, 4, 5, 6], start: 20, end: 8 } },
];

type KwMode = number | 'other';

/** The address the host is listing. `geocode` comes from a selected search result; `manual` is typed by hand. */
interface Addr {
  source: 'none' | 'geocode' | 'manual';
  line: string;
  streetName: string;
  city: string;
  zip: string;
  neighborhood: string;
}
const NO_ADDR: Addr = { source: 'none', line: '', streetName: '', city: '', zip: '', neighborhood: '' };

/** The point drivers navigate to. Only a confirmed pin may be published. */
interface PinState {
  lat: number;
  lng: number;
  confirmed: boolean;
}

interface HostForm {
  searchText: string;
  addr: Addr;
  manual: boolean;
  /** Parts the picked search result left out (OpenStreetMap often has no ZIP, sometimes no town). */
  missing: { city: boolean; zip: boolean };
  unit: string;
  spotType: SpotType;
  spots: number;
  rightToList: boolean;
  pin: PinState | null;
  /** Bump to fly the map to the pin (address chosen, GPS). Tapping must not recenter. */
  recenter: number;
  level: Level;
  kwMode: KwMode;
  kwOther: string;
  plug: Plug;
  hasAdapter: boolean;
  outdoorOutlet: boolean;
  solar: 'yes' | 'no';
  solarKw: string;
  rate: string;
  earnings: string;
  title: string;
  photos: string[];
  instructions: string;
  windows: AvailabilityWindow[];
  terms: boolean;
}

type Errors = Record<string, string>;

/** State of the electricity-rate estimate. The EIA number is one Massachusetts statewide residential average. */
type RateInfo =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'eia'; resolution: RateResolution }
  | { status: 'fallback'; resolution: RateResolution; reason: string };

const BILL_TIP = 'Replace it with the rate on your electricity bill.';
const digitsOnly = (s: string) => s.replace(/\D/g, '');

const windowSummary = (w: AvailabilityWindow) => `${summarizeDays(w.days)}, ${fmtHour(w.start)} to ${fmtHour(w.end)}${w.end <= w.start ? ' (overnight)' : ''}`;

const INITIAL: HostForm = {
  searchText: '',
  addr: NO_ADDR,
  manual: false,
  missing: { city: false, zip: false },
  unit: '',
  spotType: 'Driveway',
  spots: 1,
  rightToList: false,
  pin: null,
  recenter: 0,
  level: 'L2',
  kwMode: 9.6,
  kwOther: '',
  plug: 'J1772',
  hasAdapter: false,
  outdoorOutlet: false,
  solar: 'no',
  solarKw: '',
  rate: '0.30',
  earnings: SUGGESTED_EARNINGS_HR.toFixed(2),
  title: '',
  photos: [],
  instructions: '',
  windows: [],
  terms: false,
};

/** Fill the wizard from a published listing, for editing. Everything starts confirmed and accepted. */
function formFromListing(l: Listing): HostForm {
  const pa = l.privateAddress;
  const city = pa?.city ?? '';
  const zip = pa?.zip ?? '';
  const presets = l.level === 'L2' ? L2_PRESETS : L1_PRESETS;
  return {
    ...INITIAL,
    searchText: pa?.line ?? '',
    addr: { source: 'geocode', line: pa?.line ?? l.street, streetName: l.street, city, zip, neighborhood: l.neighborhood },
    missing: { city: city.trim().length < 2, zip: !isMassachusettsZip(zip) },
    unit: pa?.unit ?? '',
    spotType: l.spotType,
    spots: l.spots,
    rightToList: true,
    pin: { lat: l.lat, lng: l.lng, confirmed: true },
    level: l.level,
    kwMode: presets.includes(l.chargerKw) ? l.chargerKw : 'other',
    kwOther: presets.includes(l.chargerKw) ? '' : String(l.chargerKw),
    plug: l.plug,
    hasAdapter: l.adapters !== 'NONE',
    outdoorOutlet: l.level === 'L1', // required to publish an L1 listing, so it was confirmed
    solar: l.solarKw > 0 ? 'yes' : 'no',
    solarKw: l.solarKw > 0 ? String(l.solarKw) : '',
    rate: formatRateInput(l.rate),
    earnings: l.earningsHr.toFixed(2),
    title: l.title,
    photos: l.photos,
    instructions: l.instructions,
    windows: l.windows,
    terms: true,
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function ErrorText({ children }: { children?: string }) {
  return children ? (
    <Text style={styles.error} accessibilityRole="alert">
      {children}
    </Text>
  ) : null;
}

export default function HostWizard({ mode = 'new' }: { mode?: 'new' | 'edit' }) {
  const { user, hostListing, update, backend, syncAccount } = useApp();
  const editing = mode === 'edit' && hostListing !== null;
  const [step, setStep] = useState(editing ? STEPS.length - 1 : 0);
  const [form, setForm] = useState<HostForm>(() => (editing ? formFromListing(hostListing!) : INITIAL));
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  const [addrNotice, setAddrNotice] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [findMsg, setFindMsg] = useState('');
  const [finding, setFinding] = useState(false);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const titleTouched = useRef(editing);
  // A rate the host typed is never overwritten, including when editing a listing that already has one.
  const ownRate = editing && hostListing!.rateSource === 'HOST';
  const rateEditedRef = useRef(ownRate);
  // New windows must not reuse the ids of windows loaded for editing.
  const windowId = useRef(editing ? hostListing!.windows.length + 1000 : 0);

  const set = <K extends keyof HostForm>(k: K, v: HostForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toTop = () => scroll.current?.scrollTo({ y: 0, animated: false });

  /* ----- Electricity rate (EIA Massachusetts statewide residential average; the ZIP only confirms a supported
     location). A rate the host typed is never overwritten. ----- */
  const keepPublishedEia = editing && hostListing!.rateSource === 'EIA';
  const [rateInfo, setRateInfo] = useState<RateInfo>(() =>
    keepPublishedEia ? { status: 'eia', resolution: { local_rate: hostListing!.rate, source: 'EIA', dataMonth: hostListing!.rateDataMonth ?? null, overridable: true } } : { status: 'idle' },
  );
  const [rateEdited, setRateEdited] = useState(ownRate);
  const supportedLocation = isMassachusettsZip(form.addr.zip);

  useEffect(() => {
    if (!supportedLocation) return;
    if (keepPublishedEia && form.addr.zip === hostListing!.privateAddress?.zip) return;
    let cancelled = false;
    setRateInfo((r) => (r.status === 'eia' ? r : { status: 'loading' }));
    // Backend: the API asks EIA with the key kept server-side (GET /rate). Prototype: the app asks EIA directly.
    const lookup: Promise<RateInfo> = backend
      ? backend.api.getRate().then((r) =>
          r.ok && r.data.rate.source === 'EIA'
            ? { status: 'eia', resolution: r.data.rate }
            : { status: 'fallback', resolution: resolveRate(null), reason: r.ok ? 'EIA wasn’t available, so this is the fallback estimate.' : r.message },
        )
      : getMassachusettsResidentialRate().then((result) => {
          const resolution = resolveRate(result.ok ? result.rate : null);
          return result.ok ? { status: 'eia', resolution } : { status: 'fallback', resolution, reason: result.message };
        });
    void lookup.then((info) => {
      if (cancelled || (info.status !== 'eia' && info.status !== 'fallback')) return;
      setRateInfo(info);
      if (!rateEditedRef.current) set('rate', formatRateInput(info.resolution.local_rate));
    });
    return () => {
      cancelled = true;
    };
  }, [supportedLocation]);

  const estimateName = rateInfo.status === 'eia' ? 'EIA estimate' : 'fallback estimate';
  const rateHint = rateEdited
    ? `Your own rate. It replaces the ${estimateName}.`
    : rateInfo.status === 'loading'
      ? 'Looking up the Massachusetts residential average from EIA…'
      : rateInfo.status === 'eia' && rateInfo.resolution.dataMonth
        ? `Massachusetts residential average (EIA, ${formatDataMonth(rateInfo.resolution.dataMonth)}). A statewide estimate: your ZIP only confirms a supported location, so it is not specific to your ZIP or utility. EIA data runs a couple of months behind. ${BILL_TIP}`
        : rateInfo.status === 'fallback'
          ? `Fallback estimate: ${money(DEFAULT_LOCAL_RATE)}/kWh. ${rateInfo.reason} ${BILL_TIP}`
          : 'An estimate fills in once your address is chosen.';

  const kw = form.kwMode === 'other' ? Number(form.kwOther) : form.kwMode;
  const earningsCap = SUGGESTED_EARNINGS_HR * EARNINGS_CAP_MULTIPLE;
  const adapters: Adapters = !form.hasAdapter ? 'NONE' : form.plug === 'J1772' ? 'J1772_TO_NACS' : 'NACS_TO_J1772';
  const otherPlug: Plug = form.plug === 'J1772' ? 'NACS' : 'J1772';

  // Suggest a title when the host reaches the photos step and hasn't typed their own.
  useEffect(() => {
    if (step === 3 && !titleTouched.current && !form.title) {
      const hood = form.addr.neighborhood || form.addr.city || 'Massachusetts';
      set('title', `${hood} ${form.spotType.toLowerCase()}`);
    }
  }, [step]);

  function validate(s: number): Errors {
    const e: Errors = {};
    if (s === 0) {
      const a = form.addr;
      if (form.manual) {
        if (a.line.trim().length < 4) e.line = 'Enter your street address.';
        if (a.city.trim().length < 2) e.city = 'Enter your city or town.';
        if (!isMassachusettsZip(a.zip)) e.zip = 'Enter a 5-digit Massachusetts ZIP code.';
      } else if (a.source !== 'geocode') {
        e.address = 'Choose your address from the suggestions.';
      } else {
        if (a.city.trim().length < 2) e.city = 'Enter your city or town.';
        if (!isMassachusettsZip(a.zip)) e.zip = 'Enter your 5-digit Massachusetts ZIP code.';
      }
      if (!form.pin) e.pin = 'Place the pin on your driveway or charger entrance.';
      else if (!form.pin.confirmed) e.pin = 'Confirm the pin location before continuing.';
      if (!form.rightToList) e.rightToList = 'Confirm you have the right to list this spot.';
    }
    if (s === 1) {
      const [lo, hi] = form.level === 'L2' ? [L2_KW_MIN, CHARGER_KW_MAX] : [CHARGER_KW_MIN, L1_KW_MAX];
      if (!Number.isFinite(kw) || kw < lo || kw > hi) e.kw = `Enter a power between ${lo} and ${hi} kW for ${form.level}.`;
      if (form.level === 'L1' && !form.outdoorOutlet) e.outdoorOutlet = 'L1 needs a dedicated outdoor-rated outlet.';
      if (form.solar === 'yes') {
        const s2 = Number(form.solarKw);
        if (form.solarKw.trim() === '' || !Number.isFinite(s2) || s2 < 0 || s2 > SOLAR_KW_MAX) e.solarKw = `Enter your system size between 0 and ${SOLAR_KW_MAX} kW.`;
      }
    }
    if (s === 2) {
      const r = Number(form.rate);
      if (!Number.isFinite(r) || r < MIN_LOCAL_RATE || r > MAX_LOCAL_RATE) e.rate = `Enter a rate between ${money(MIN_LOCAL_RATE)} and ${money(MAX_LOCAL_RATE)} per kWh.`;
      const en = Number(form.earnings);
      if (!Number.isFinite(en) || en <= 0) e.earnings = 'Enter what you’d like to earn per hour.';
      else if (en > earningsCap) e.earnings = `The most you can set here is ${money(earningsCap)} per hour (2× the suggested ${money(SUGGESTED_EARNINGS_HR)}).`;
    }
    if (s === 3) {
      if (form.title.trim().length < 4) e.title = 'Give your listing a title.';
      if (form.photos.length < 1) e.photos = 'Add at least one photo.';
      if (form.instructions.trim().length < 20) e.instructions = 'Write at least 20 characters so drivers can find the spot.';
    }
    if (s === 4) {
      if (form.windows.length < 1) e.windows = 'Add at least one availability window.';
      else if (form.windows.some((w) => w.days.length === 0)) e.windows = 'Pick at least one day for each window.';
      else if (form.windows.some((w) => w.start === w.end)) e.windows = 'Each window needs different start and end times.';
    }
    if (s === 5 && !form.terms) e.terms = 'Accept the terms to publish.';
    return e;
  }

  function goTo(i: number) {
    setErrors({});
    setStep(i);
    toTop();
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      toTop();
      return;
    }
    publish();
  }

  function publish() {
    // Never publish without an address and a pin the host confirmed.
    const pin = form.pin;
    if (!pin || !pin.confirmed || form.addr.source === 'none') {
      setErrors({ pin: 'Confirm the pin location before publishing.' });
      setStep(0);
      toTop();
      return;
    }
    setBusy(true);
    if (backend) return void publishOnServer(pin);
    const a = form.addr;
    const listing: Listing = {
      // Editing keeps the same listing, so links and the host's own-listing check still match it.
      id: editing ? hostListing!.id : `host-${Date.now()}`,
      title: form.title.trim(),
      // Public summaries show the street name only. The exact address stays in privateAddress.
      street: a.streetName || stripHouseNumber(a.line),
      neighborhood: a.neighborhood || a.city,
      lat: pin.lat,
      lng: pin.lng,
      privateAddress: { line: a.line, unit: form.unit.trim() || undefined, city: a.city, state: 'MA', zip: a.zip },
      spotType: form.spotType,
      chargerKw: kw,
      level: form.level,
      plug: form.plug,
      adapters,
      solarKw: form.solar === 'yes' ? Number(form.solarKw) : 0,
      spots: form.spots,
      hostName: (user?.name ?? '').trim().split(/\s+/)[0],
      rate: Number(form.rate),
      rateSource: rateEdited ? 'HOST' : rateInfo.status === 'eia' ? 'EIA' : 'FALLBACK',
      rateDataMonth: !rateEdited && rateInfo.status === 'eia' ? rateInfo.resolution.dataMonth : null,
      earningsHr: Number(form.earnings),
      windows: form.windows,
      instructions: form.instructions.trim(),
      photos: form.photos,
      isNew: editing ? hostListing!.isNew : true,
    };
    update({ hostListing: listing });
    // Back to the host screen already in the stack (from Edit), or in place of the wizard (new listing).
    router.dismissTo(HOST_HOME_PATH as Href);
  }

  /**
   * Backend: upload new photos (existing ones keep their keys), then PUT /me/listing. The server reruns the full
   * validation; its field errors land on the matching step.
   */
  async function publishOnServer(pin: PinState) {
    const stop = (errs: Errors, toStep?: number) => {
      setBusy(false);
      setErrors(errs);
      if (toStep !== undefined) setStep(toStep);
      toTop();
    };
    const keys: string[] = [];
    for (const photo of form.photos) {
      const i = hostListing?.photos.indexOf(photo) ?? -1;
      const kept = i >= 0 ? hostListing?.photoKeys?.[i] : undefined;
      if (kept) {
        keys.push(kept);
        continue;
      }
      const up = await uploadPhoto(backend!.api, { kind: 'listing' }, photo);
      if (!up.ok) return stop({ photos: up.message, publish: up.message }, 3);
      keys.push(up.key);
    }
    const a = form.addr;
    const r = await backend!.api.saveListing({
      title: form.title.trim(),
      street: a.streetName,
      neighborhood: a.neighborhood,
      address: { line: a.line, unit: form.unit.trim() || null, city: a.city, zip: a.zip },
      lat: pin.lat,
      lng: pin.lng,
      spotType: form.spotType,
      spots: form.spots,
      rightToList: form.rightToList,
      level: form.level,
      chargerKw: kw,
      plug: form.plug,
      adapters,
      outdoorOutlet: form.outdoorOutlet,
      solarKw: form.solar === 'yes' ? Number(form.solarKw) : 0,
      rate: Number(form.rate),
      rateSource: rateEdited ? 'HOST' : rateInfo.status === 'eia' ? 'EIA' : 'FALLBACK',
      rateDataMonth: !rateEdited && rateInfo.status === 'eia' ? rateInfo.resolution.dataMonth : null,
      earningsHr: Number(form.earnings),
      windows: form.windows,
      instructions: form.instructions.trim(),
      photoKeys: keys,
      termsAccepted: form.terms,
    });
    if (!r.ok) {
      const fields = (r.details.fields ?? {}) as Partial<Record<ListingField, string>>;
      const names = Object.keys(fields) as ListingField[];
      if (names.length === 0) return stop({ publish: r.message });
      return stop({ ...fields, publish: `Some details need fixing: ${Object.values(fields).join(' ')}` }, Math.min(...names.map((f) => FIELD_STEP[f] ?? 5)));
    }
    update({ hostListing: r.data.listing });
    await syncAccount();
    setBusy(false);
    // Back to the host screen already in the stack (from Edit), or in place of the wizard (new listing).
    router.dismissTo(HOST_HOME_PATH as Href);
  }

  /* ----- Address and pin. Any address change throws away the old pin: coordinates are never reused. ----- */

  const clearErrors = (...keys: string[]) =>
    setErrors((e) => {
      const nextErrors = { ...e };
      keys.forEach((k) => delete nextErrors[k]);
      return nextErrors;
    });

  function onSearchInput(t: string) {
    setAddrNotice('');
    setForm((f) => ({ ...f, searchText: t, addr: NO_ADDR, pin: null, missing: { city: false, zip: false } }));
  }

  function onSelectAddress(a: GeocodedAddress) {
    if (!isMassachusetts(a)) {
      setAddrNotice(`That address is in ${a.state || 'another state'}. Dwell is only available in Massachusetts right now.`);
      setForm((f) => ({ ...f, addr: NO_ADDR, pin: null }));
      return;
    }
    setAddrNotice('');
    clearErrors('address', 'city', 'zip');
    const zipOk = isMassachusettsZip(a.zip);
    const cityOk = a.city.trim().length >= 2;
    setForm((f) => ({
      ...f,
      searchText: a.line1,
      addr: { source: 'geocode', line: a.line1, streetName: a.streetName, city: cityOk ? a.city : '', zip: zipOk ? a.zip : '', neighborhood: a.neighborhood },
      missing: { city: !cityOk, zip: !zipOk },
      // Start the pin at the geocoded point; the host must still place it exactly and confirm it.
      pin: { lat: a.lat, lng: a.lng, confirmed: false },
      recenter: f.recenter + 1,
    }));
  }

  /** Typing an address by hand keeps the pin where it is, but it has to be confirmed again. */
  function editManual(field: 'line' | 'city' | 'zip', value: string) {
    setFindMsg('');
    setForm((f) => {
      const addr = { ...f.addr, source: 'manual' as const, [field]: value };
      return { ...f, addr: { ...addr, streetName: stripHouseNumber(addr.line), neighborhood: addr.city }, pin: f.pin ? { ...f.pin, confirmed: false } : null };
    });
  }

  const canFindTyped = form.addr.line.trim().length >= 4 && (form.addr.city.trim().length >= 2 || isMassachusettsZip(form.addr.zip));

  /** Look up the typed address and move the pin there, so the host starts close instead of at the state's center. */
  async function findTypedAddress() {
    const a = form.addr;
    const q = [a.line, a.city, `MA ${a.zip}`.trim()].filter((p) => p.trim()).join(', ');
    setFinding(true);
    setFindMsg('');
    let hit: GeocodedAddress | undefined;
    for (const types of [ADDRESS_TYPES, DESTINATION_TYPES]) {
      const r = await searchAddresses(q, { types, limit: 5 });
      hit = r.ok ? r.results.find(isMassachusetts) : undefined;
      if (hit) break;
    }
    setFinding(false);
    if (!hit) return setFindMsg('We couldn’t find that address. Tap the map to place the pin.');
    clearErrors('pin');
    const exact = hit.featureType === 'address';
    setFindMsg(exact ? 'Pin moved to that address. Check it, then confirm.' : `Pin moved near ${hit.label}. Move it to your driveway, then confirm.`);
    setForm((f) => ({ ...f, pin: { lat: hit!.lat, lng: hit!.lng, confirmed: false }, recenter: f.recenter + 1 }));
  }

  /** Fill in a part the search result left out. The pin stays: the point on the map has not changed. */
  function fillGeocoded(field: 'city' | 'zip', value: string) {
    clearErrors(field);
    setForm((f) => ({ ...f, addr: { ...f.addr, [field]: value } }));
  }

  function useManualEntry() {
    setAddrNotice('');
    setForm((f) => ({ ...f, manual: true, searchText: '', addr: NO_ADDR, pin: null }));
  }

  const onPinMove = (p: { lat: number; lng: number }) => {
    clearErrors('pin');
    setForm((f) => ({ ...f, pin: { lat: p.lat, lng: p.lng, confirmed: false } }));
  };
  const confirmPin = () => {
    clearErrors('pin');
    setForm((f) => (f.pin ? { ...f, pin: { ...f.pin, confirmed: true } } : f));
  };
  const unconfirmPin = () => setForm((f) => (f.pin ? { ...f, pin: { ...f.pin, confirmed: false } } : f));

  async function useMyLocation() {
    setLocMsg('Finding you…');
    const r = await locateUser({ precise: true });
    if (!r.ok) {
      return setLocMsg(r.reason === 'DENIED' ? 'Location is off for Dwell. Tap the map to place the pin instead.' : 'We couldn’t get your location. Tap the map to place the pin instead.');
    }
    // Positions the same pin as the map does. It still needs the host's explicit confirmation.
    clearErrors('pin');
    setForm((f) => ({ ...f, pin: { lat: r.lat, lng: r.lng, confirmed: false }, recenter: f.recenter + 1 }));
    setLocMsg('Pin moved to your location. Check it, then confirm.');
  }

  async function addPhoto(source: PhotoSource) {
    setPhotoError('');
    if (form.photos.length >= MAX_PHOTOS) return;
    const r = await takePhoto(source, { maxDim: LISTING_PHOTO_DIM });
    if (r.ok) setForm((f) => ({ ...f, photos: [...f.photos, r.dataUrl].slice(0, MAX_PHOTOS) }));
    else if (r.reason !== 'CANCELLED') setPhotoError(r.message);
  }

  const addWindow = (w: Omit<AvailabilityWindow, 'id'>) => set('windows', [...form.windows, { ...w, id: `w${++windowId.current}` }]);
  const patchWindow = (id: string, patch: Partial<AvailabilityWindow>) => set('windows', form.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const priceRows = useMemo(
    () =>
      PRICE_TABLE_CARS.map((car) => {
        const p = computePrice({ charger_kW: kw, car_max_AC_kW: car.maxAcKw, local_rate: Number(form.rate), host_earnings_hr: Number(form.earnings), booked_hours: 1 });
        return { car, p: p.ok ? p.value : null };
      }),
    [kw, form.rate, form.earnings],
  );

  /* ---------- Step bodies ---------- */

  const body = [
    // 0 Your spot
    <>
      {form.manual ? (
        <View style={styles.group}>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Entering your address by hand. You will place and confirm the pin yourself.{' '}
              <TextLink label="Use address search instead" onPress={() => setForm((f) => ({ ...f, manual: false, addr: NO_ADDR, pin: null, searchText: '' }))} />
            </Text>
          </View>
          <TextField label="Street address" autoComplete="address-line1" textContentType="streetAddressLine1" value={form.addr.line} error={errors.line} onChangeText={(v) => editManual('line', v)} />
          <TextField label="Unit (optional)" value={form.unit} onChangeText={(v) => set('unit', v)} />
          <TextField label="City or town" autoComplete="address-line2" textContentType="addressCity" value={form.addr.city} error={errors.city} onChangeText={(v) => editManual('city', v)} />
          <View style={styles.row}>
            <View style={styles.half}>
              <ReadOnlyField label="State" value="MA" hint="Massachusetts only" />
            </View>
            <View style={styles.half}>
              <TextField label="ZIP code" keyboardType="number-pad" maxLength={5} autoComplete="postal-code" textContentType="postalCode" value={form.addr.zip} error={errors.zip} onChangeText={(v) => editManual('zip', digitsOnly(v).slice(0, 5))} />
            </View>
          </View>
          <Button label={finding ? 'Finding…' : 'Find this address on the map'} variant="secondary" block disabled={!canFindTyped || finding} onPress={() => void findTypedAddress()} />
          {findMsg ? (
            <Text style={styles.status} accessibilityLiveRegion="polite">
              {findMsg}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.group}>
          <AddressAutocomplete value={form.searchText} onInputChange={onSearchInput} onSelect={onSelectAddress} error={addrNotice || errors.address || undefined} hint="Search your Massachusetts street address and pick it from the list." />
          <TextField label="Unit (optional)" value={form.unit} onChangeText={(v) => set('unit', v)} />
          {form.addr.source === 'geocode' ? (
            <>
              {form.missing.city ? (
                <TextField label="City or town" hint="The search result didn’t include a town." value={form.addr.city} error={errors.city} onChangeText={(v) => fillGeocoded('city', v)} />
              ) : (
                <ReadOnlyField label="City or town" value={form.addr.city} hint="From your selected address" />
              )}
              <View style={styles.row}>
                <View style={styles.half}>
                  <ReadOnlyField label="State" value="MA" />
                </View>
                <View style={styles.half}>
                  {form.missing.zip ? (
                    <TextField label="ZIP code" keyboardType="number-pad" maxLength={5} hint="The search result didn’t include a ZIP. It fills in your electricity rate." value={form.addr.zip} error={errors.zip} onChangeText={(v) => fillGeocoded('zip', digitsOnly(v).slice(0, 5))} />
                  ) : (
                    <ReadOnlyField label="ZIP code" value={form.addr.zip} />
                  )}
                </View>
              </View>
            </>
          ) : null}
          <Text style={styles.fine}>
            Can’t find it? <TextLink label="Enter the address by hand" onPress={useManualEntry} />
          </Text>
        </View>
      )}

      <View style={styles.group}>
        <Pressable accessibilityRole="button" onPress={() => void useMyLocation()} style={({ pressed }) => [styles.locate, pressed && { backgroundColor: colors.brandTint }]}>
          <Pin size={18} color={colors.ink} />
          <Text style={styles.locateText}>I’m at the spot: use my location</Text>
        </Pressable>
        {locMsg ? (
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {locMsg}
          </Text>
        ) : null}
      </View>

      {form.pin || form.addr.source !== 'none' || form.manual ? (
        <PinPicker
          position={form.pin}
          confirmed={form.pin?.confirmed ?? false}
          onMove={onPinMove}
          onConfirm={confirmPin}
          onUnconfirm={unconfirmPin}
          recenterToken={form.recenter}
          fallbackCenter={MASSACHUSETTS_CENTER}
          error={errors.pin}
        />
      ) : (
        <View style={styles.pinPlaceholder}>
          <Text style={styles.fine}>The map appears after you choose an address. You will move the pin to your driveway or charger entrance and confirm it.</Text>
          <ErrorText>{errors.pin}</ErrorText>
        </View>
      )}
      <ChoiceGroup<SpotType> legend="Type of spot" options={SPOT_TYPES.map((t) => ({ value: t, label: t }))} value={form.spotType} onChange={(v) => set('spotType', v)} />
      <Field label="Number of spots">
        <Stepper label="Spots" value={form.spots} min={1} max={4} onChange={(n) => set('spots', n)} />
      </Field>
      <CheckboxCard checked={form.rightToList} onChange={(v) => set('rightToList', v)} lead="I have the right to list this spot." error={errors.rightToList}>
        I own it, or my landlord, condo association or shared-driveway neighbors allow it.
      </CheckboxCard>
    </>,

    // 1 Charger
    <>
      <ChoiceGroup<Level>
        legend="Charger level"
        columns={1}
        options={[
          { value: 'L2', label: 'Level 2', sub: '240 V wall charger, 7 to 19 kW' },
          { value: 'L1', label: 'Level 1', sub: '120 V outlet, 1 to 2 kW, priced lower' },
        ]}
        value={form.level}
        onChange={(v) => setForm((f) => ({ ...f, level: v, kwMode: v === 'L2' ? 9.6 : 1.44, kwOther: '', outdoorOutlet: false }))}
      />
      <Field label="Charger power">
        <View style={styles.pills} accessibilityLabel="Charger power">
          {(form.level === 'L2' ? L2_PRESETS : L1_PRESETS).map((p) => (
            <Pill key={p} label={`${p} kW`} selected={form.kwMode === p} onPress={() => set('kwMode', p)} />
          ))}
          <Pill label="Other" selected={form.kwMode === 'other'} onPress={() => set('kwMode', 'other')} />
        </View>
        {form.kwMode === 'other' ? <TextField label="Power (kW)" keyboardType="decimal-pad" value={form.kwOther} error={errors.kw} onChangeText={(v) => set('kwOther', v)} /> : <ErrorText>{errors.kw}</ErrorText>}
      </Field>
      <ChoiceGroup<Plug>
        legend="Plug type"
        options={[
          { value: 'J1772', label: 'J1772', sub: 'Most non-Tesla EVs' },
          { value: 'NACS', label: 'NACS', sub: 'Teslas and newer EVs' },
        ]}
        value={form.plug}
        onChange={(v) => setForm((f) => ({ ...f, plug: v, hasAdapter: false }))}
      />
      <CheckboxCard checked={form.hasAdapter} onChange={(v) => set('hasAdapter', v)} lead={`I have a ${form.plug} → ${otherPlug} adapter I can leave at the charger.`}>
        Drivers with {otherPlug} cars can then book you.
      </CheckboxCard>
      {form.level === 'L1' ? (
        <CheckboxCard checked={form.outdoorOutlet} onChange={(v) => set('outdoorOutlet', v)} lead="This is a dedicated outdoor-rated outlet." error={errors.outdoorOutlet}>
          Never an extension cord.
        </CheckboxCard>
      ) : null}
      <ChoiceGroup<'yes' | 'no'>
        legend="Do you have solar panels?"
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        value={form.solar}
        onChange={(v) => set('solar', v)}
      />
      {form.solar === 'yes' ? <TextField label="Solar system size (kW)" keyboardType="decimal-pad" value={form.solarKw} error={errors.solarKw} onChangeText={(v) => set('solarKw', v)} /> : null}
      <View style={styles.note}>
        <Text style={styles.noteStrong}>
          {form.level}, {Number.isFinite(kw) && kw > 0 ? `${kw} kW` : 'kW not set'}, {form.plug}
          {form.hasAdapter ? `, adapter to ${otherPlug}` : ''}
          {form.solar === 'yes' && form.solarKw ? `, ${form.solarKw} kW solar` : ''}
        </Text>
      </View>
    </>,

    // 2 Pricing
    <>
      <TextField
        label="Electricity rate ($/kWh)"
        keyboardType="decimal-pad"
        hint={rateHint}
        value={form.rate}
        error={errors.rate}
        onChangeText={(v) => {
          rateEditedRef.current = true;
          setRateEdited(true);
          set('rate', v);
        }}
      />
      <TextField
        label="You earn per hour ($)"
        keyboardType="decimal-pad"
        hint={`Suggested ${money(SUGGESTED_EARNINGS_HR)}. The most you can set is ${money(earningsCap)}.`}
        value={form.earnings}
        error={errors.earnings}
        onChangeText={(v) => set('earnings', v)}
      />
      <View style={styles.group}>
        <Text style={styles.h3}>What drivers pay per hour</Text>
        {priceRows.map(({ car, p }) => (
          <View key={car.id} style={styles.priceRow} accessibilityLabel={`${car.name}: draws ${p ? `${p.P_eff} kilowatts` : 'not available'}, pays ${p ? money(p.price_per_hr) : 'not available'} per hour`}>
            <View style={styles.flex}>
              <Text style={styles.priceCar}>{car.name}</Text>
              <Text style={styles.fine}>
                Draws {p ? `${p.P_eff} kW` : 'n/a'} · electricity {p ? money(p.electricity_cost_per_hr) : 'n/a'} · you earn {money(Number(form.earnings) || 0)}
              </Text>
            </View>
            <Text style={styles.pricePays}>{p ? money(p.price_per_hr) : 'n/a'}</Text>
          </View>
        ))}
        <Text style={styles.fine}>Driver pays = min(charger kW, car kW) × your rate + what you earn. Drivers also pay a 10% service fee on top.</Text>
      </View>
    </>,

    // 3 Photos & instructions
    <>
      <TextField
        label="Listing title"
        value={form.title}
        error={errors.title}
        onChangeText={(v) => {
          titleTouched.current = true;
          set('title', v);
        }}
      />
      <Field label="Photos">
        <View style={styles.photos}>
          {form.photos.map((src, i) => (
            <View key={`${i}-${src.length}`} style={styles.photo}>
              <Image source={{ uri: src }} style={StyleSheet.absoluteFill} accessibilityLabel={`Listing photo ${i + 1}`} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => set('photos', form.photos.filter((_, j) => j !== i))} style={styles.remove} hitSlop={6}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
        {form.photos.length < MAX_PHOTOS ? (
          <View style={styles.row}>
            <View style={styles.half}>
              <Button label="Take a photo" variant="secondary" block onPress={() => void addPhoto('camera')} />
            </View>
            <View style={styles.half}>
              <Button label="Choose photos" variant="secondary" block onPress={() => void addPhoto('library')} />
            </View>
          </View>
        ) : null}
        <ErrorText>{errors.photos || photoError || undefined}</ErrorText>
        <Text style={styles.fine}>Up to 8 photos. Show the street view, the charger and where to park.</Text>
      </Field>
      <TextAreaField label="Parking instructions" hint="Where to park, where the charger is, and anything to watch for." value={form.instructions} error={errors.instructions} onChangeText={(v) => set('instructions', v)} />
    </>,

    // 4 Availability
    <>
      <View style={styles.presets} accessibilityLabel="Add a window">
        {PRESETS.map((p) => (
          <Pill key={p.label} label={p.label} selected={false} onPress={() => addWindow(p.w)} />
        ))}
      </View>
      <ErrorText>{errors.windows}</ErrorText>
      {form.windows.map((w) => (
        <View key={w.id} style={styles.window}>
          <View style={styles.windowHead}>
            <Text style={styles.windowTitle}>{windowSummary(w)}</Text>
            <Button label="Remove" variant="ghost" size="nav" onPress={() => set('windows', form.windows.filter((x) => x.id !== w.id))} />
          </View>
          <View style={styles.days} accessibilityLabel="Days">
            {DAY_LABELS.map((d, i) => {
              const on = w.days.includes(i);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityLabel={d}
                  accessibilityState={{ selected: on }}
                  onPress={() => patchWindow(w.id, { days: on ? w.days.filter((x) => x !== i) : [...w.days, i].sort() })}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayText, on && { color: colors.onInk }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <SelectField label="From" value={w.start} options={HOURS.map((h) => ({ value: h, label: fmtHour(h) }))} onChange={(h) => patchWindow(w.id, { start: h })} />
            </View>
            <View style={styles.half}>
              <SelectField label="To" value={w.end} options={HOURS.map((h) => ({ value: h, label: fmtHour(h) }))} onChange={(h) => patchWindow(w.id, { end: h })} />
            </View>
          </View>
        </View>
      ))}
      {form.windows.length === 0 ? <Text style={styles.muted}>No windows yet. Add one above to appear in search.</Text> : null}
    </>,

    // 5 Review
    <>
      <View style={styles.review}>
        {[
          { i: 0, k: 'Spot', v: `${form.spotType}, ${form.addr.line}${form.unit ? ` #${form.unit}` : ''}, ${form.addr.city}, MA ${form.addr.zip}. Pin ${form.pin?.confirmed ? 'confirmed' : 'not confirmed'}, ${form.spots} spot${form.spots > 1 ? 's' : ''}` },
          { i: 1, k: 'Charger', v: `${form.level}, ${kw} kW, ${form.plug}${form.hasAdapter ? `, adapter to ${otherPlug}` : ''}${form.solar === 'yes' ? `, ${form.solarKw} kW solar` : ''}` },
          { i: 2, k: 'Pricing', v: `${money(Number(form.rate) || 0)}/kWh, you earn ${money(Number(form.earnings) || 0)}/hr` },
          { i: 3, k: 'Listing', v: `${form.title}, ${form.photos.length} photo${form.photos.length === 1 ? '' : 's'}` },
          { i: 4, k: 'Availability', v: form.windows.map(windowSummary).join('; ') },
        ].map((r, idx) => (
          <View key={r.k} style={[styles.reviewRow, idx > 0 && styles.reviewRule]}>
            <View style={styles.flex}>
              <Text style={styles.reviewKey}>{r.k}</Text>
              <Text style={styles.reviewValue}>{r.v}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${r.k}`} onPress={() => goTo(r.i)} hitSlop={8}>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
        ))}
      </View>
      <View style={styles.note}>
        <Text style={styles.h3}>What happens next</Text>
        <Text style={styles.noteText}>•  Your listing goes live in search right away.</Text>
        <Text style={styles.noteText}>•  Drivers book a window. You never hand over a key or touch the car.</Text>
        <Text style={styles.noteText}>•  Each session ends when the driver taps Pick up near your driveway.</Text>
      </View>
      <CheckboxCard checked={form.terms} onChange={(v) => set('terms', v)} lead="I agree to the Dwell host terms." error={errors.terms}>
        Payments and notifications are simulated in this demo.
      </CheckboxCard>
    </>,
  ];

  // Hosting needs an account and allows one listing for now. This comes after every hook.
  if (!user) return <Redirect href={SIGNUP_FOR_HOSTING_PATH as Href} />;
  if (mode === 'new' && hostListing) return <Redirect href={HOST_HOME_PATH as Href} />;
  if (mode === 'edit' && !hostListing) return <Redirect href={NEW_LISTING_PATH as Href} />;

  const last = step === STEPS.length - 1;
  const head = editing && last ? { title: 'Review and save', why: 'Use Edit on any section to change it, then save.' } : STEP_HEAD[step];

  return (
    <Screen header={<Header />} scrollRef={scroll}>
      {errors.publish ? <WarnNote>{errors.publish}</WarnNote> : null}
      <Wizard
        title={editing ? 'Edit your listing' : 'List your charger'}
        steps={STEPS}
        current={step}
        onStepClick={goTo}
        stepTitle={head.title}
        stepWhy={head.why}
        nextLabel={editing && last ? 'Save changes' : undefined}
        onBack={() => goTo(step - 1)}
        onNext={next}
        busy={busy}
      >
        {body[step]}
      </Wizard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: space.md },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  field: { gap: space.xs },
  label: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.ink },
  error: { fontFamily: fonts.bodyMedium, fontSize: text.xs, color: colors.amberInk },
  status: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  fine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  muted: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  h3: { fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },
  note: { gap: 6, borderRadius: radius.card, backgroundColor: colors.surface, padding: 14 },
  noteText: { fontFamily: fonts.body, fontSize: text.sm, lineHeight: 21, color: colors.body },
  noteStrong: { fontFamily: fonts.bodyMedium, fontSize: text.sm, color: colors.body },
  locate: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper },
  locateText: { fontFamily: fonts.bodyMedium, fontSize: text.md, color: colors.ink },
  pinPlaceholder: { gap: space.xs, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, padding: space.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.line, paddingVertical: 10 },
  priceCar: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  pricePays: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  photo: { width: 96, height: 96, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  remove: { position: 'absolute', right: 4, top: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: fonts.bodyMedium, fontSize: 18, lineHeight: 20, color: colors.ink },
  presets: { gap: space.xs, alignItems: 'flex-start' },
  window: { gap: space.sm, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, padding: space.md },
  windowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  windowTitle: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: text.md, color: colors.ink },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  review: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.line },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md },
  reviewRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line },
  reviewKey: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.muted },
  reviewValue: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.ink },
  edit: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.brand, textDecorationLine: 'underline' },
});
