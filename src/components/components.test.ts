import { describe, expect, it } from '@jest/globals';

import { EV_MODELS } from '@/shared/data/evFallbackSeed';
import { SEEDED_LISTINGS } from '@/shared/data/seedListings';
import { makeOf, modelOf, versionLabel } from './CarPicker';
import { addressSecondary, matchStations } from './DestinationSearch';

describe('matchStations', () => {
  it('matches station names and aliases, ignoring case and punctuation, up to four', () => {
    expect(matchStations('central')[0]).toMatchObject({ primary: 'Central Square', badge: 'T station', payload: { kind: 'station', id: 'central' } });
    expect(matchStations('KENDALL')[0].payload.id).toBe('kendall');
    expect(matchStations('square').length).toBeLessThanOrEqual(4);
    expect(matchStations('   ')).toEqual([]);
  });
});

describe('addressSecondary', () => {
  it('reads "City, ST 02139"', () => {
    expect(addressSecondary({ city: 'Cambridge', state: 'MA', zip: '02139' } as never)).toBe('Cambridge, MA 02139');
    expect(addressSecondary({ city: '', state: 'MA', zip: '' } as never)).toBe('MA');
  });
});

describe('CarPicker labels', () => {
  it('splits the seeded cars into make and model, and labels a version with its speed', () => {
    const leaf = EV_MODELS.find((c) => c.id === 'nissan-leaf')!;
    expect(makeOf(leaf)).toBe('Nissan');
    expect(modelOf(leaf)).toBe('Leaf');
    expect(versionLabel(leaf)).toBe('Any year · 6.6 kW');
    expect(versionLabel({ id: 'x', name: 'Kia EV6', make: 'Kia', model: 'EV6', year: 2024, version: 'Wind', maxAcKw: null, plug: 'NACS' })).toBe('2024 Wind · speed unknown');
  });
});

describe('offline sample listings', () => {
  it('are the 34 seeded listings, each with a pin and a price', () => {
    expect(SEEDED_LISTINGS).toHaveLength(34);
    expect(new Set(SEEDED_LISTINGS.map((l) => l.id)).size).toBe(34);
    for (const l of SEEDED_LISTINGS) {
      expect(Number.isFinite(l.lat) && Number.isFinite(l.lng)).toBe(true);
      expect(l.chargerKw).toBeGreaterThan(0);
      expect(l.windows.length).toBeGreaterThan(0);
    }
  });
});
