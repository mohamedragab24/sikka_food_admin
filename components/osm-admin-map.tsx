'use client';

import dynamic from 'next/dynamic';
import type { DemoRow, Point } from '../lib/admin-types';

const ClientMap = dynamic(() => import('./osm-admin-map-client').then((module) => module.OpenStreetMap), {
  ssr: false,
  loading: () => <div className="osm-map map-loading" role="status">جارٍ تحميل خريطة OpenStreetMap…</div>,
});

type MapMarker = { position: Point; title: string; detail: string; tone?: string; onSelect?: () => void };
type ZoneShape = { id: string; name: string; polygon: Point[]; active?: boolean };

export function OpenStreetMap(props: {
  markers?: MapMarker[]; zones?: ZoneShape[]; draft?: Point[]; onAddPoint?: (point: Point) => void; center?: Point; zoom?: number;
}) {
  return <ClientMap {...props} />;
}

export function zoneShapes(rows: DemoRow[]): ZoneShape[] {
  return rows.map((row) => ({
    id: String(row.id ?? ''), name: String(row.name ?? ''), polygon: Array.isArray(row.polygon) ? row.polygon as Point[] : [], active: row.status !== 'موقوفة',
  }));
}
