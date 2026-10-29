import { useCallback } from 'react';

import { ADDRESS_SEARCH_CREDIT, ADDRESS_TYPES, isMassachusetts, searchAddresses, type GeocodedAddress } from '@/shared/adapters/addressSearch';
import Combobox, { type ComboOption, type ComboSearch } from '../Combobox';
import { addressSecondary } from '../DestinationSearch';

/**
 * Port of the web's AddressAutocomplete.tsx: US street-address search (Mapbox with a token, otherwise OpenStreetMap
 * through Photon). Results outside Massachusetts are listed but flagged; the wizard rejects them on selection.
 */
export default function AddressAutocomplete({
  label = 'Street address',
  value,
  onInputChange,
  onSelect,
  error,
  hint,
}: {
  label?: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (address: GeocodedAddress) => void;
  error?: string;
  hint?: string;
}) {
  const search = useCallback<ComboSearch<GeocodedAddress>>(async (q, signal) => {
    const r = await searchAddresses(q, { signal, types: ADDRESS_TYPES });
    if (!r.ok) return { ok: false, message: r.message, aborted: r.reason === 'ABORTED' };
    return {
      ok: true,
      options: r.results.map<ComboOption<GeocodedAddress>>((a) => ({
        id: a.id,
        primary: a.line1,
        secondary: addressSecondary(a),
        badge: isMassachusetts(a) ? undefined : 'Not in MA',
        payload: a,
      })),
    };
  }, []);

  return (
    <Combobox<GeocodedAddress>
      label={label}
      value={value}
      onInputChange={onInputChange}
      onSelect={(o) => onSelect(o.payload)}
      search={search}
      placeholder="Start typing your street address"
      hint={hint}
      error={error}
      unavailableNote="You can enter the address by hand instead."
      footerNote={ADDRESS_SEARCH_CREDIT}
    />
  );
}
