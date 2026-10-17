'use client';

import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useEffect } from 'react';
import type { Point, DemoRow } from '../lib/demo-data';

const CAIRO: Point = [30.0444, 31.2357];

type MapMarker = { position: Point; title: string; detail: string; tone?: string; onSelect?: () => void };

type ZoneShape = { id: string; name: string; polygon: Point[]; active?: boolean };

function ClickCapture({ onAddPoint }: { onAddPoint?: (point: Point) => void }) {
  useMapEvents({ click(event) { onAddPoint?.([event.latlng.lat, event.latlng.lng]); } });
  return null;
}

function Recenter({ center }: { center: Point }) {
  const map = useMap();
  useEffect(() => { map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

export function OpenStreetMap({
  markers = [], zones = [], draft = [], onAddPoint, center = CAIRO, zoom = 11,
}: {
  markers?: MapMarker[];
  zones?: ZoneShape[];
  draft?: Point[];
  onAddPoint?: (point: Point) => void;
  center?: Point;
  zoom?: number;
}) {
  return (
    <div className="osm-map" dir="ltr">
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="osm-leaflet-map">
        <Recenter center={center} />
        <ClickCapture onAddPoint={onAddPoint} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {zones.map((zone) => zone.polygon.length >= 3 && (
          <Polygon
            key={zone.id}
            positions={zone.polygon}
            pathOptions={{ color: zone.active === false ? '#918b94' : '#7651a0', fillColor: zone.active === false ? '#a19aa4' : '#7651a0', fillOpacity: .14, weight: 2 }}
          >
            <Popup>{zone.name}{zone.active === false ? ' — موقوفة' : ''}</Popup>
          </Polygon>
        ))}
        {draft.length > 0 && <>
          {draft.length >= 3 && <Polygon positions={draft} pathOptions={{ color: '#ff7657', fillColor: '#ff7657', fillOpacity: .22, dashArray: '5 6' }} />}
          {draft.map((point, index) => <CircleMarker key={`draft-${index}`} center={point} radius={6} pathOptions={{ color: '#fff', fillColor: '#ff7657', fillOpacity: 1, weight: 2 }}><Popup>نقطة {index + 1}</Popup></CircleMarker>)}
        </>}
        {markers.map((marker, index) => <CircleMarker key={`${marker.title}-${index}`} center={marker.position} radius={8} eventHandlers={{ click: marker.onSelect }} pathOptions={{ color: '#fff', fillColor: marker.tone ?? '#ff7657', fillOpacity: 1, weight: 3 }}>
          <Popup><strong>{marker.title}</strong><br />{marker.detail}</Popup>
        </CircleMarker>)}
      </MapContainer>
    </div>
  );
}

export function zoneShapes(rows: DemoRow[]): ZoneShape[] {
  return rows.map((row) => ({
    id: String(row.id ?? ''), name: String(row.name ?? ''), polygon: Array.isArray(row.polygon) ? row.polygon as Point[] : [], active: row.status !== 'موقوفة',
  }));
}
