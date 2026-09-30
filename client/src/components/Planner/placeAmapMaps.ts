import { generateAmapMapsUrl, type NamedWaypoint } from '../Map/RouteCalculator'
import type { AssignmentPlace, Place } from '../../types'

type PlaceLike = Pick<Place | AssignmentPlace, 'name' | 'lat' | 'lng'>

/**
 * Single-place AMap deep link. Reuses `generateAmapMapsUrl` for the same WGS-84
 * marker URI the renderer uses for a one-stop route, keeping the two in sync.
 */
export function getAmapMapsUrlForPlace(place: PlaceLike | null | undefined): string | null {
  if (!place) return null
  if (place.lat == null || place.lng == null) return null
  const stops: NamedWaypoint[] = [{ lat: place.lat, lng: place.lng, name: place.name ?? null }]
  return generateAmapMapsUrl(stops)
}
