import { describe, it, expect } from 'vitest'
import type { Place } from '../../types'
import { getAmapMapsUrlForPlace } from './placeAmapMaps'

type Sample = Pick<Place, 'name' | 'lat' | 'lng'>
const base: Sample = { name: 'Bund', lat: 31.24, lng: 121.49 }

describe('getAmapMapsUrlForPlace', () => {
  it('FE-PLACE-AMAP-001: returns the marker URI with coordinate=wgs84 for a single located place', () => {
    const url = getAmapMapsUrlForPlace(base)
    expect(url).toBe(
      'https://uri.amap.com/marker?position=121.49,31.24&coordinate=wgs84&src=tt-travel-planner&name=' +
        encodeURIComponent(base.name ?? ''),
    )
  })

  it('FE-PLACE-AMAP-002: omits the name query when the place has no name', () => {
    const url = getAmapMapsUrlForPlace({ ...base, name: '' })
    expect(url).toBe(
      'https://uri.amap.com/marker?position=121.49,31.24&coordinate=wgs84&src=tt-travel-planner',
    )
  })

  it('FE-PLACE-AMAP-003: returns null when there are no coordinates', () => {
    expect(getAmapMapsUrlForPlace(null)).toBeNull()
    expect(getAmapMapsUrlForPlace({ ...base, lat: null, lng: null })).toBeNull()
  })

  it('FE-PLACE-AMAP-004: returns null when the place is undefined', () => {
    expect(getAmapMapsUrlForPlace(undefined)).toBeNull()
  })

  it('FE-PLACE-AMAP-005: a null name is treated like an empty string', () => {
    const url = getAmapMapsUrlForPlace({ ...base, name: null })
    expect(url).toBe(
      'https://uri.amap.com/marker?position=121.49,31.24&coordinate=wgs84&src=tt-travel-planner',
    )
  })

})
