import { loadAmap } from './engines/amap';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock stores to avoid localStorage access during module initialization.
//
// The selector has to be honoured, not ignored: the component reads its AMap key
// through `useSettingsStore((s) => s.settings.amap_js_api_key)`, and a mock that
// answers every call with a freshly built object hands the map-lifecycle effect a
// new dependency on each render. The effect then tears the map down and rebuilds
// it forever, so `ready` never settles and no markers are ever drawn — which is
// exactly what these tests looked like when the mock returned a literal.
const settingsState = {
  language: 'en',
  temperature_unit: 'celsius',
  distance_unit: 'metric',
  settings: { amap_js_api_key: 'test-amap-key' },
};

vi.mock('../../store/settingsStore', () => ({
  useSettingsStore: vi.fn((selector?: (s: typeof settingsState) => unknown) =>
    typeof selector === 'function' ? selector(settingsState) : settingsState
  ),
}));

// Mock Leaflet before importing the component to prevent window access errors
vi.mock('leaflet', () => ({
  default: {},
  map: vi.fn(),
  marker: vi.fn(),
  tileLayer: vi.fn(),
}));

// Mock MapView (Leaflet fallback) to prevent it from being used
vi.mock('./MapView', () => ({
  MapView: vi.fn(() => null),
}));

import { MapViewAMap } from './MapViewAMap';

const mockAMap = () => {
  const overlays: any[] = [];
  const listeners = new Map<string, ((e: any) => void)[]>();
  // AMap reports bounds in GCJ-02; the explorer expects WGS-84. Tests
  // mutate `bounds` directly to simulate a pan/zoom between assertions,
  // and the conversion is the same identity the engine mock applies
  // (lng - 0.006, lat - 0.006), so the expected WGS-84 numbers are
  // predictable.
  const bounds = {
    sw: { lng: 116.41, lat: 39.91 },
    ne: { lng: 116.43, lat: 39.93 },
  };

  const map = {
    destroy: vi.fn(),
    setZoomAndCenter: vi.fn(),
    setFitView: vi.fn(),
    getZoom: vi.fn(() => 10),
    setCenter: vi.fn(),
    getBounds: vi.fn(() => ({
      getSouthWest: () => ({ getLng: () => bounds.sw.lng, getLat: () => bounds.sw.lat }),
      getNorthEast: () => ({ getLng: () => bounds.ne.lng, getLat: () => bounds.ne.lat }),
    })),
    on: vi.fn((event: string, handler: (e: any) => void) => {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    }),
    off: vi.fn((event: string, handler: (e: any) => void) => {
      const handlers = listeners.get(event) || [];
      listeners.set(
        event,
        handlers.filter((h) => h !== handler)
      );
    }),
    trigger: (event: string, payload: any) => {
      const handlers = listeners.get(event) || [];
      handlers.forEach((h) => h(payload));
    },
  };

  // Create real constructor functions, not arrow functions
  function MockMap(_container: HTMLElement, _options?: any) {
    return map;
  }

  function MockMarker(opts: any) {
    const marker = {
      options: opts,
      setMap: vi.fn((m: any) => {
        if (m) overlays.push(marker);
        else overlays.splice(overlays.indexOf(marker), 1);
      }),
      on: vi.fn(),
      setPosition: vi.fn(),
      getElement: vi.fn(() => {
        if (typeof document !== 'undefined') {
          return document.createElement('div');
        }
        return null;
      }),
    };
    return marker;
  }

  function MockPolyline(opts: any) {
    const line = { options: opts, setMap: vi.fn(), on: vi.fn() };
    return line;
  }

  function MockCircle(opts: any) {
    const circle = { options: opts, setMap: vi.fn(), on: vi.fn() };
    return circle;
  }

  function MockPolygon(opts: any) {
    const polygon = { options: opts, setMap: vi.fn(), on: vi.fn() };
    return polygon;
  }

  function MockInfoWindow() {
    return { open: vi.fn(), close: vi.fn(), setContent: vi.fn() };
  }

  function MockLngLat(lng: number, lat: number) {
    return { getLng: () => lng, getLat: () => lat };
  }

  const AMap = {
    Map: vi.fn(MockMap),
    Marker: vi.fn(MockMarker),
    Polyline: vi.fn(MockPolyline),
    Circle: vi.fn(MockCircle),
    Polygon: vi.fn(MockPolygon),
    InfoWindow: vi.fn(MockInfoWindow),
    LngLat: vi.fn(MockLngLat),
  };

  return { map, AMap, overlays, listeners, bounds };
};

// Store the current mock instance globally so tests can access it
let currentMockInstance: ReturnType<typeof mockAMap> | null = null;

vi.mock('./engines/amap', () => {
  return {
    loadAmap: vi.fn(async () => {
      // Add a small delay to allow React to attach the ref
      await new Promise((resolve) => setTimeout(resolve, 50));
      currentMockInstance = mockAMap();
      return currentMockInstance.AMap;
    }),
    wgs84ToGcj02: vi.fn((lng: number, lat: number) => {
      return { lng: lng + 0.006, lat: lat + 0.006 };
    }),
    gcj02ToWgs84: vi.fn((lng: number, lat: number) => ({ lng: lng - 0.006, lat: lat - 0.006 })),
  };
});

vi.mock('../../hooks/useGeolocation', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useGeolocation')>(),
  getCurrentPositionOnce: vi.fn(),
}));

vi.mock('../../api/client', () => ({
  pluginsApi: {
    mapMarkers: vi.fn(() => Promise.resolve({ markers: [] })),
    mapLayers: vi.fn(() => Promise.resolve({ layers: [] })),
  },
  mapsApi: {
    // Add any mapsApi methods if needed
  },
}));

vi.mock('./amapOverlays', () => ({
  ReservationAMapOverlay: vi.fn(function ReservationAMapOverlay(_map: any, _AMap: any) {
    return {
      update: vi.fn(),
      destroy: vi.fn(),
    };
  }),
  attachLocationAMapOverlay: vi.fn(() => ({
    update: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe('MapViewAMap clustering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  it('FE-COMP-MAPVIEWAMAP-001: clusters nearby places at zoom 10', async () => {
    const { loadAmap } = await import('./engines/amap');
    const { container } = render(
      <MapViewAMap
        places={[
          { id: 1, lat: 39.908, lng: 116.397, name: 'A' },
          { id: 2, lat: 39.9081, lng: 116.3971, name: 'B' },
        ]}
        zoom={10}
        center={[39.908, 116.397]}
      />
    );

    // Wait for component to fully render and ref to be attached
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify loadAmap was called
    await waitFor(() => expect(loadAmap).toHaveBeenCalled(), { timeout: 3000 });

    // Verify mock instance was created
    await waitFor(() => expect(currentMockInstance).toBeTruthy(), { timeout: 3000 });

    // Wait for Map to be constructed
    await waitFor(
      () => {
        expect(currentMockInstance!.AMap.Map).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    const AMap = currentMockInstance!.AMap;

    // Wait for markers to be created
    await waitFor(
      () => {
        const markerCalls = AMap.Marker.mock.calls;
        expect(markerCalls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const markerCalls = AMap.Marker.mock.calls;
    // Find the cluster marker - it should have "2 places" in the title
    const clusterMarker = markerCalls.find(
      (call: any) => call[0]?.title?.includes('places') || call[0]?.content?.includes('places')
    );
    expect(clusterMarker).toBeTruthy();
    expect(clusterMarker[0].title).toBe('2 places');
  });

  it('FE-COMP-MAPVIEWAMAP-002: dissolves clusters at zoom 11', async () => {
    const { loadAmap } = await import('./engines/amap');
    const { rerender } = render(
      <MapViewAMap
        places={[
          { id: 1, lat: 39.908, lng: 116.397, name: 'A' },
          { id: 2, lat: 39.9081, lng: 116.3971, name: 'B' },
        ]}
        zoom={11}
        center={[39.908, 116.397]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const AMap = currentMockInstance!.AMap;

    rerender(
      <MapViewAMap
        places={[
          { id: 1, lat: 39.908, lng: 116.397, name: 'A' },
          { id: 2, lat: 39.9081, lng: 116.3971, name: 'B' },
        ]}
        zoom={11}
        center={[39.908, 116.397]}
      />
    );

    await waitFor(() => {
      const markerCalls = AMap.Marker.mock.calls;
      const clusterMarkers = markerCalls.filter((call: any) => call[0].content?.includes('places'));
      expect(clusterMarkers.length).toBe(0);
    });
  });
});

describe('MapViewAMap event priority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  it('FE-COMP-MAPVIEWAMAP-003: marker click suppresses map click', async () => {
    const { loadAmap } = await import('./engines/amap');
    const onMapClick = vi.fn();
    const onMarkerClick = vi.fn();

    render(
      <MapViewAMap
        places={[{ id: 1, lat: 39.908, lng: 116.397, name: 'A' }]}
        zoom={12}
        center={[39.908, 116.397]}
        onMapClick={onMapClick}
        onMarkerClick={onMarkerClick}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { AMap, map } = currentMockInstance!;

    // Wait for marker to be created
    await waitFor(
      () => {
        expect(AMap.Marker.mock.results.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const marker = AMap.Marker.mock.results[0].value;

    // Verify marker.on was called with 'click'
    await waitFor(() => {
      const clickCall = marker.on.mock.calls.find((call: any) => call[0] === 'click');
      expect(clickCall).toBeTruthy();
    });

    const clickCall = marker.on.mock.calls.find((call: any) => call[0] === 'click');
    const markerClickHandler = clickCall![1];

    // Trigger marker click - this sets suppressMapClickRef to true
    markerClickHandler();

    // Immediately trigger map click (before microtask runs)
    // This should be suppressed
    map.trigger('click', { lnglat: { getLng: () => 116.397, getLat: () => 39.908 } });

    // onMarkerClick should be called with place id (1)
    expect(onMarkerClick).toHaveBeenCalledWith(1);

    // Map click should be suppressed because marker was clicked
    expect(onMapClick).not.toHaveBeenCalled();
  });

  it('FE-COMP-MAPVIEWAMAP-004: GPX track click suppresses map click', async () => {
    const { loadAmap } = await import('./engines/amap');
    const onMapClick = vi.fn();
    const onMarkerClick = vi.fn();

    render(
      <MapViewAMap
        places={[
          {
            id: 1,
            lat: 39.908,
            lng: 116.397,
            name: 'A',
            route_geometry: JSON.stringify([
              [39.908, 116.397],
              [39.909, 116.398],
            ]),
          },
        ]}
        zoom={12}
        center={[39.908, 116.397]}
        onMapClick={onMapClick}
        onMarkerClick={onMarkerClick}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { AMap, map } = currentMockInstance!;

    // Wait for polylines to be created
    await waitFor(
      () => {
        expect(AMap.Polyline.mock.results.length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    const hitLine = AMap.Polyline.mock.results.find((r: any) => r.value.options.strokeOpacity === 0)?.value;
    expect(hitLine).toBeTruthy();

    const hitClickHandler = hitLine?.on.mock.calls.find((call: any) => call[0] === 'click')?.[1];
    expect(hitClickHandler).toBeTruthy();

    // Trigger GPX track click - this sets suppressMapClickRef to true
    hitClickHandler?.();

    // Immediately trigger map click (before microtask runs)
    // This should be suppressed
    map.trigger('click', { lnglat: { getLng: () => 116.397, getLat: () => 39.908 } });

    expect(onMarkerClick).toHaveBeenCalledWith(1);
    expect(onMapClick).not.toHaveBeenCalled();
  });
});

describe('MapViewAMap recorded trail (4.3 port)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  // The AMap renderer is the one engine upstream has no twin of, so this is the
  // only place the GCJ boundary in front of the recorded track is pinned. A
  // regression here is invisible: the map still draws a line, just one that sits
  // a few hundred metres west of where the user walked.
  const track = {
    days: [
      {
        date: '2026-05-01',
        segments: [
          {
            points: [
              [39.9, 116.4],
              [39.91, 116.42],
            ] as [number, number][],
            mode: 'walking',
            startedAt: '2026-05-01T08:00:00.000Z',
            endedAt: '2026-05-01T09:00:00.000Z',
            distanceMeters: 1200,
          },
        ],
      },
    ],
    source: 'tracks' as const,
    fetchedAt: '2026-05-02T00:00:00.000Z',
    pointCount: 2,
    truncated: false,
  };

  it('FE-COMP-MAPVIEWAMAP-007: draws the recorded trail as casing under a day-coloured dashed line', async () => {
    const { loadAmap } = await import('./engines/amap');
    render(<MapViewAMap zoom={11} center={[39.9, 116.4]} dawarichTrack={track} />);

    await waitFor(() => expect(loadAmap).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(currentMockInstance).toBeTruthy(), { timeout: 3000 });
    const AMap = currentMockInstance!.AMap;

    // Two lines: the casing pass and the coloured pass, in that order.
    await waitFor(
      () => {
        expect(AMap.Polyline.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 }
    );

    const casing = AMap.Polyline.mock.calls.find((call: any) => call[0]?.strokeWeight === 6);
    const main = AMap.Polyline.mock.calls.find((call: any) => call[0]?.strokeStyle === 'dashed');
    expect(casing).toBeTruthy();
    expect(main).toBeTruthy();
    expect(casing![0].strokeOpacity).toBe(0.55);
    expect(main![0].strokeWeight).toBe(3);
    // The casing is drawn first, so every coloured line sits above every casing.
    expect(AMap.Polyline.mock.calls.indexOf(casing!)).toBeLessThan(AMap.Polyline.mock.calls.indexOf(main!));

    // Every vertex crossed WGS-84 → GCJ-02 at the boundary.
    expect(main![0].path).toEqual([
      [116.406, 39.906],
      [116.426, 39.916],
    ]);
  });

  it('FE-COMP-MAPVIEWAMAP-008: a selected day narrows the trail to that day and clearing removes it', async () => {
    const { loadAmap } = await import('./engines/amap');
    const twoDays = {
      ...track,
      days: [
        track.days[0],
        {
          date: '2026-05-02',
          segments: [
            {
              points: [
                [39.92, 116.44],
                [39.93, 116.46],
              ] as [number, number][],
              mode: 'cycling',
              startedAt: '2026-05-02T08:00:00.000Z',
              endedAt: '2026-05-02T09:00:00.000Z',
              distanceMeters: 3000,
            },
          ],
        },
      ],
    };

    const { rerender } = render(
      <MapViewAMap zoom={11} center={[39.9, 116.4]} dawarichTrack={twoDays} dawarichSelectedDate="2026-05-02" />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(currentMockInstance).toBeTruthy(), { timeout: 3000 });
    const AMap = currentMockInstance!.AMap;

    await waitFor(
      () => {
        expect(AMap.Polyline.mock.calls.length).toBeGreaterThanOrEqual(2);
      },
      { timeout: 3000 }
    );
    // Only the selected day is drawn: one segment, so exactly two lines.
    expect(AMap.Polyline.mock.calls.length).toBe(2);
    expect(AMap.Polyline.mock.calls[1][0].path).toEqual([
      [116.446, 39.926],
      [116.466, 39.936],
    ]);

    const drawn = AMap.Polyline.mock.results.map((r: any) => r.value);
    AMap.Polyline.mockClear();

    // Dropping the track takes every overlay back off the map.
    rerender(<MapViewAMap zoom={11} center={[39.9, 116.4]} dawarichTrack={null} />);

    await waitFor(() => {
      expect(drawn.every((line: any) => line.setMap.mock.calls.some((call: any[]) => call[0] === null))).toBe(true);
    });
    expect(AMap.Polyline.mock.calls.length).toBe(0);
  });
});

describe('MapViewAMap lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  it('FE-COMP-MAPVIEWAMAP-005: cleans up event listeners on unmount', async () => {
    const { loadAmap } = await import('./engines/amap');
    const { unmount } = render(<MapViewAMap zoom={10} center={[39.908, 116.397]} />);

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;

    unmount();

    expect(map.off).toHaveBeenCalledWith('click', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    expect(map.off).toHaveBeenCalledWith('zoomend', expect.any(Function));
    expect(map.destroy).toHaveBeenCalled();
  });

  it('FE-COMP-MAPVIEWAMAP-006: reuses reservation overlay on props update', async () => {
    const { loadAmap } = await import('./engines/amap');
    const { ReservationAMapOverlay } = await import('./amapOverlays');

    const { rerender } = render(<MapViewAMap reservations={[]} zoom={10} center={[39.908, 116.397]} />);

    await waitFor(() => expect(loadAmap).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() => expect(currentMockInstance).toBeTruthy(), { timeout: 3000 });

    const { map } = currentMockInstance!;

    // Wait for map event listeners to be attached (this means ready state is true)
    await waitFor(
      () => {
        expect(map.on).toHaveBeenCalledWith('click', expect.any(Function));
        expect(map.on).toHaveBeenCalledWith('zoomend', expect.any(Function));
      },
      { timeout: 3000 }
    );

    // Wait for the overlay to be created
    await waitFor(
      () => {
        expect(ReservationAMapOverlay).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    const firstInstance = (ReservationAMapOverlay as any).mock.results[0]?.value;
    expect(firstInstance).toBeTruthy();

    // Wait for initial update call
    await waitFor(
      () => {
        expect(firstInstance.update).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Clear the update mock calls
    firstInstance.update.mockClear();

    // Rerender with new reservations
    rerender(
      <MapViewAMap
        reservations={[{ id: 1, trip_id: 1, title: 'Test', status: 'confirmed', type: 'flight', endpoints: [] }]}
        zoom={10}
        center={[39.908, 116.397]}
      />
    );

    // Wait for update to be called again with new reservations
    await waitFor(
      () => {
        expect(firstInstance.update).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Verify that destroy was NOT called (overlay is reused)
    expect(firstInstance.destroy).not.toHaveBeenCalled();

    // Verify ReservationAMapOverlay was only constructed once
    expect(ReservationAMapOverlay).toHaveBeenCalledTimes(1);
  });
});

/**
 * The camera belongs to the user once they have moved it.
 *
 * `setFitView` is a request to frame the trip, and `fitKey` is that request being
 * made — a day is picked, a place is opened. The two place lists are also in the
 * effect's dependency list because it reads them, but their identity changes on
 * every route recompute and every websocket update. Refitting on those moved the
 * map out from under the user: zoom in, a route lands, and the camera jumps back
 * to the framed view. That is the "zoom jumps around" report.
 */
describe('MapViewAMap camera framing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  it('FE-COMP-MAPVIEWAMAP-040: a data update alone never refits the camera', async () => {
    const { loadAmap } = await import('./engines/amap');
    const place = { id: 1, name: 'A', lat: 39.9, lng: 116.4 };
    const { rerender } = render(
      <MapViewAMap places={[place]} fitKey={1} zoom={10} center={[39.908, 116.397]} />
    );
    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;
    await waitFor(() => expect(map.setFitView).toHaveBeenCalled());
    const afterFirst = map.setFitView.mock.calls.length;

    // Same fitKey, a fresh array identity — what a route recompute hands over.
    rerender(
      <MapViewAMap places={[{ ...place }]} fitKey={1} zoom={10} center={[39.908, 116.397]} />
    );

    expect(map.setFitView.mock.calls.length).toBe(afterFirst);
  });

  it('FE-COMP-MAPVIEWAMAP-041: a new fitKey does reframe, which is what it is for', async () => {
    const { loadAmap } = await import('./engines/amap');
    const place = { id: 1, name: 'A', lat: 39.9, lng: 116.4 };
    const { rerender } = render(
      <MapViewAMap places={[place]} fitKey={1} zoom={10} center={[39.908, 116.397]} />
    );
    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;
    await waitFor(() => expect(map.setFitView).toHaveBeenCalled());
    const before = map.setFitView.mock.calls.length;

    rerender(
      <MapViewAMap places={[place]} fitKey={2} zoom={10} center={[39.908, 116.397]} />
    );

    expect(map.setFitView.mock.calls.length).toBeGreaterThan(before);
  });
});

/**
 * The POI-explore pill needs the visible bbox on every pan/zoom (and once when
 * the map is ready) so it can fetch Overpass/AMap POIs for the current viewport.
 * MapViewAMap is the engine that previously ignored `onViewportChange`, so the
 * bbox stayed null and the first toggle fetched nothing. These tests pin the
 * initial/moveend/zoomend emission, the GCJ-02 -> WGS-84 conversion, the
 * cleanup, and the no-stale-callback path that the mount-only lifecycle needs.
 */
describe('MapViewAMap viewport emission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentMockInstance = null;
  });

  it('FE-COMP-MAPVIEWAMAP-042: emits the initial bbox as WGS-84 once the map is ready', async () => {
    const onViewportChange = vi.fn();
    render(
      <MapViewAMap
        onViewportChange={onViewportChange}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());

    // Bounds reported by the mock are GCJ-02 (lng + 0.006, lat + 0.006);
    // the engine mock reverses the +0.006 so the WGS-84 corners are the
    // numbers below.
    await waitFor(() =>
      expect(onViewportChange).toHaveBeenCalledWith({
        south: expect.closeTo(39.904, 6),
        west: expect.closeTo(116.404, 6),
        north: expect.closeTo(39.924, 6),
        east: expect.closeTo(116.424, 6),
      })
    );
    expect(onViewportChange).toHaveBeenCalledTimes(1);
  });

  it('FE-COMP-MAPVIEWAMAP-043: a moveend re-emits the bbox in WGS-84', async () => {
    const onViewportChange = vi.fn();
    render(
      <MapViewAMap
        onViewportChange={onViewportChange}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map, bounds } = currentMockInstance!;

    onViewportChange.mockClear();
    // Pan the map: a new SW/NE in GCJ-02 should come out as the matching WGS-84.
    bounds.sw = { lng: 116.50, lat: 39.95 };
    bounds.ne = { lng: 116.52, lat: 39.97 };
    map.trigger('moveend', {});

    expect(onViewportChange).toHaveBeenLastCalledWith({
      south: expect.closeTo(39.944, 6),
      west: expect.closeTo(116.494, 6),
      north: expect.closeTo(39.964, 6),
      east: expect.closeTo(116.514, 6),
    });
  });

  it('FE-COMP-MAPVIEWAMAP-044: a zoomend re-emits the bbox in WGS-84', async () => {
    const onViewportChange = vi.fn();
    render(
      <MapViewAMap
        onViewportChange={onViewportChange}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map, bounds } = currentMockInstance!;

    onViewportChange.mockClear();
    bounds.sw = { lng: 116.60, lat: 40.00 };
    bounds.ne = { lng: 116.62, lat: 40.02 };
    map.trigger('zoomend', {});

    expect(onViewportChange).toHaveBeenLastCalledWith({
      south: expect.closeTo(39.994, 6),
      west: expect.closeTo(116.594, 6),
      north: expect.closeTo(40.014, 6),
      east: expect.closeTo(116.614, 6),
    });
  });

  it('FE-COMP-MAPVIEWAMAP-045: a swapped SW/NE still produces south <= north, west <= east', async () => {
    const onViewportChange = vi.fn();
    render(
      <MapViewAMap
        onViewportChange={onViewportChange}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map, bounds } = currentMockInstance!;

    onViewportChange.mockClear();
    // A crossed-corner GCJ box, which gcj02ToWgs84 also crosses, must still
    // come out with south <= north and west <= east.
    bounds.sw = { lng: 116.60, lat: 40.00 };
    bounds.ne = { lng: 116.40, lat: 39.80 };
    map.trigger('moveend', {});

    const last = onViewportChange.mock.calls[onViewportChange.mock.calls.length - 1]?.[0];
    expect(last.south).toBeLessThanOrEqual(last.north);
    expect(last.west).toBeLessThanOrEqual(last.east);
    // Specifically: 39.794/116.394 .. 39.994/116.594.
    expect(last).toEqual({
      south: expect.closeTo(39.794, 6),
      west: expect.closeTo(116.394, 6),
      north: expect.closeTo(39.994, 6),
      east: expect.closeTo(116.594, 6),
    });
  });

  it('FE-COMP-MAPVIEWAMAP-046: a fresh onViewportChange prop is honoured without rebinding listeners', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <MapViewAMap
        onViewportChange={first}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;

    // Count the moveend registrations made by the viewport listener.
    const moveendCallsBefore = map.on.mock.calls.filter((c: any[]) => c[0] === 'moveend').length;

    rerender(
      <MapViewAMap
        onViewportChange={second}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    // No new listener: the lifecycle is mount-only and reads the latest
    // callback through a ref. A duplicate binding would mean every move
    // fires both first and second, which would break the explorer the
    // moment the parent forgets to memoize.
    const moveendCallsAfter = map.on.mock.calls.filter((c: any[]) => c[0] === 'moveend').length;
    expect(moveendCallsAfter).toBe(moveendCallsBefore);

    first.mockClear();
    second.mockClear();
    map.trigger('moveend', {});

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('FE-COMP-MAPVIEWAMAP-047: unmount detaches moveend and the viewport zoomend', async () => {
    const onViewportChange = vi.fn();
    const { unmount } = render(
      <MapViewAMap
        onViewportChange={onViewportChange}
        zoom={10}
        center={[39.92, 116.42]}
      />
    );

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;

    unmount();

    // moveend: one binding, one detachment.
    const moveendOn = map.on.mock.calls.filter((c: any[]) => c[0] === 'moveend').length;
    const moveendOff = map.off.mock.calls.filter((c: any[]) => c[0] === 'moveend').length;
    expect(moveendOn).toBe(1);
    expect(moveendOff).toBe(1);

    // zoomend has the existing zoom-state handler plus the viewport handler
    // (two on calls, two off calls).
    const zoomendOn = map.on.mock.calls.filter((c: any[]) => c[0] === 'zoomend').length;
    const zoomendOff = map.off.mock.calls.filter((c: any[]) => c[0] === 'zoomend').length;
    expect(zoomendOn).toBe(2);
    expect(zoomendOff).toBe(2);

    // Firing after unmount must not reach the parent's callback.
    onViewportChange.mockClear();
    map.trigger('moveend', {});
    map.trigger('zoomend', {});
    expect(onViewportChange).not.toHaveBeenCalled();
  });

  it('FE-COMP-MAPVIEWAMAP-048: without onViewportChange the listener still no-ops cleanly', async () => {
    render(<MapViewAMap zoom={10} center={[39.92, 116.42]} />);

    await waitFor(() => expect(loadAmap).toHaveBeenCalled());
    await waitFor(() => expect(currentMockInstance).toBeTruthy());
    const { map } = currentMockInstance!;

    // The explorer may arrive on the next render; the listener should not
    // throw when no callback is registered yet.
    expect(() => map.trigger('moveend', {})).not.toThrow();
    expect(() => map.trigger('zoomend', {})).not.toThrow();
  });
});

describe('AMap deliberate camera requests', () => {
 beforeEach(() => { vi.clearAllMocks(); currentMockInstance = null; });
 it('focuses the requested place with GCJ-02 coordinates and repeats after panning', async () => {
   const place = {id: 91, name:'临高县', lat:19.914146, lng:109.686346};
   const props = {places:[place],selectedPlaceId:91,fitKey:1,leftWidth:300,rightWidth:280,hasInspector:true};
   const {rerender} = render(<MapViewAMap {...props} focusPlaceKey={0} />);
   await waitFor(()=>expect(currentMockInstance?.map.setFitView).toHaveBeenCalled());
   const {map} = currentMockInstance!; map.setFitView.mockClear();
   rerender(<MapViewAMap {...props} focusPlaceKey={1} />);
   await waitFor(()=>expect(map.setFitView).toHaveBeenCalledTimes(1));
   const call = map.setFitView.mock.calls[0];
   expect(call.slice(1)).toEqual([false,[60,340,340,320],15]);
   expect(call[0][0].options.position).toEqual([place.lng+0.006,place.lat+0.006]);
   rerender(<MapViewAMap {...props} places={[{...place}]} focusPlaceKey={1} />);
   expect(map.setFitView).toHaveBeenCalledTimes(1);
   rerender(<MapViewAMap {...props} focusPlaceKey={2} />);
   await waitFor(()=>expect(map.setFitView).toHaveBeenCalledTimes(2));
 });
 it('does not focus a place with missing coordinates', async () => {
   const {rerender} = render(<MapViewAMap places={[]} focusPlaceKey={0} />);
   await waitFor(()=>expect(currentMockInstance?.map.setZoomAndCenter).toHaveBeenCalled());
   const {map} = currentMockInstance!; map.setFitView.mockClear();
   rerender(<MapViewAMap places={[{id:1,lat:null,lng:null}]} selectedPlaceId={1} focusPlaceKey={1} />);
   expect(map.setFitView).not.toHaveBeenCalled();
 });
 it('shows and frames a browser fix only after pressing locate', async () => {
   const {getCurrentPositionOnce} = await import('../../hooks/useGeolocation');
   const {attachLocationAMapOverlay} = await import('./amapOverlays');
   const fix = {lat:30.5,lng:104.1,accuracy:25,heading:null,speed:null,timestamp:1};
   vi.mocked(getCurrentPositionOnce).mockResolvedValue(fix);
   const {getByRole} = render(<MapViewAMap places={[]} />);
   const button = getByRole('button',{name:'journey.editor.useCurrentLocation'});
   await waitFor(()=>expect(button).not.toBeDisabled());
   expect(getCurrentPositionOnce).not.toHaveBeenCalled();
   fireEvent.click(button);
   await waitFor(()=>expect(currentMockInstance!.map.setFitView).toHaveBeenCalled());
   const last = currentMockInstance!.map.setFitView.mock.calls.slice(-1)[0]!;
   expect(last[0][0].options.position).toEqual([fix.lng+0.006,fix.lat+0.006]);
   const handle = vi.mocked(attachLocationAMapOverlay).mock.results.slice(-1)[0]!.value;
   expect(handle.update).toHaveBeenLastCalledWith(fix);
 });
});
