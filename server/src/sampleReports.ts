// 10 SAMPLE reports for the demo. They are invented, NOT real incidents, and every one is labelled "Sample" in the app.
// Layout: a 5-person cluster (becomes a danger zone) on the straight line from Sealdah to Esplanade, a 3-person cluster
// (stays below the 4-person threshold, so it is NOT a zone), and two single reports. Turn off with SAMPLE_REPORTS=off.
import type { PReport } from './dangerZones.js';

const S = (n: number, category: string, lat: number, lng: number, daysAgo: number, description: string, area: string) =>
  ({ n, category, lat, lng, daysAgo, description, area });
const ROWS = [
  S(1, 'harassment', 22.5662, 88.3604, 3, 'Group of men passing comments after dark.', 'Taltala side lane'),
  S(2, 'poor_lighting', 22.5659, 88.3608, 6, 'Streetlights not working for the whole stretch.', 'Taltala side lane'),
  S(3, 'harassment', 22.5664, 88.3601, 9, 'Followed by two men on a bike.', 'Taltala side lane'),
  S(4, 'suspicious_activity', 22.5660, 88.3611, 12, 'People loitering near the closed shops.', 'Taltala side lane'),
  S(5, 'poor_lighting', 22.5657, 88.3603, 15, 'Very dark, no lights near the crossing.', 'Taltala side lane'),
  S(6, 'poor_lighting', 22.5671, 88.3670, 4, 'One streetlight out.', 'Near Sealdah'),
  S(7, 'isolated_area', 22.5669, 88.3674, 8, 'Empty after 8 pm.', 'Near Sealdah'),
  S(8, 'poor_lighting', 22.5672, 88.3668, 20, 'Dim lights under the flyover.', 'Near Sealdah'),
  S(9, 'road_hazard', 22.5702, 88.3562, 7, 'Open drain without cover.', 'Park Street side'),
  S(10, 'improved_lighting', 22.5631, 88.3560, 5, 'New LED lights installed.', 'Esplanade side'),
];
export const DEMO_TRIP = { from: [22.5675, 88.3700] as [number, number], to: [22.5646, 88.3510] as [number, number] };

export function sampleReports(now = Date.now()): (PReport & { sample: true; description: string; area_label: string; reliability: 'corroborated'; verification_status: 'unverified'; corroboration_count: number; flag_count: number; created_at: string })[] {
  return ROWS.map(r => {
    const at = new Date(now - r.daysAgo * 86400000).toISOString();
    return { id: `sample-${r.n}`, reporter: `sample-person-${r.n}`, category: r.category, lat: r.lat, lng: r.lng, occurred_at: at, created_at: at,
      description: r.description, area_label: r.area, sample: true as const, reliability: 'corroborated' as const, verification_status: 'unverified' as const, corroboration_count: 0, flag_count: 0 };
  });
}
