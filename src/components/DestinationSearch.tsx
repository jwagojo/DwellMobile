import { useCallback } from 'react';

import { ADDRESS_SEARCH_CREDIT, DESTINATION_TYPES, searchAddresses, type GeocodedAddress } from '@/shared/adapters/addressSearch';
import { addressToDestination, stationToDestination } from '@/shared/data/destinations';
import { STATIONS } from '@/shared/data/stations';
import type { Destination } from '@/shared/types/destination';
import Combobox, { type ComboOption, type ComboSearch } from './Combobox';

/** Port of the web's src/components/DestinationSearch.tsx. */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** T stations whose name or alias contains the text. Instant, no network. */
export function matchStations(query: string): ComboOption<Destination>[] {
  const q = norm(query);
  if (!q) return [];
  return STATIONS.filter((s) => norm(s.name).includes(q) || s.aliases?.some((a) => norm(a).includes(q)))
    .slice(0, 4)
    .map((s) => ({ id: `station-${s.id}`, primary: s.name, secondary: s.group, badge: 'T station', payload: stationToDestination(s) }));
}

/** The web's AddressAutocomplete.tsx `addressSecondary`: "Cambridge, MA 02139". */
export const addressSecondary = (a: GeocodedAddress) => [a.city, `${a.state} ${a.zip}`.trim()].filter(Boolean).join(', ');

const badgeFor = (a: GeocodedAddress) => (a.featureType === 'address' ? 'Address' : a.featureType === 'street' ? 'Street' : 'Area');

/**
 * "Where are you headed?" field: T stations match instantly, and any US address, street or neighborhood comes from
 * the address search (Mapbox with a token, otherwise OpenStreetMap). If the lookup fails, stations still work.
 */
export default function DestinationSearch({
  label,
  value,
  onInputChange,
  onSelect,
  onBlur,
  error,
  hint,
  placeholder = 'T station or address',
}: {
  label: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (destination: Destination) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}) {
  const search = useCallback<ComboSearch<Destination>>(async (q, signal) => {
    const r = await searchAddresses(q, { signal, types: DESTINATION_TYPES });
    if (!r.ok) return { ok: false, message: r.message, aborted: r.reason === 'ABORTED' };
    return {
      ok: true,
      options: r.results.map<ComboOption<Destination>>((a) => ({
        id: a.id,
        primary: a.line1,
        secondary: addressSecondary(a),
        badge: badgeFor(a),
        payload: addressToDestination(a),
      })),
    };
  }, []);

  return (
    <Combobox<Destination>
      label={label}
      value={value}
      onInputChange={onInputChange}
      onSelect={(o) => onSelect(o.payload)}
      onBlur={onBlur}
      search={search}
      localOptions={matchStations}
      placeholder={placeholder}
      hint={hint}
      error={error}
      unavailableNote="T stations still work."
      footerNote={ADDRESS_SEARCH_CREDIT}
      emptyText="No matching places. Try a T station or a street address."
    />
  );
}
