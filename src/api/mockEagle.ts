import type { EaglePayload, EagleStop } from './types';

// Sample day for `npm run dev:mock`: a rep's day around Mumias and Butere (western Kenya).
const USERS = [{ key: 'U1', name: 'RAPHAEL', code: 'M16' }, { key: 'U2', name: 'Ann Wanjiru', code: 'M02' }, { key: 'U3', name: 'Brian Otieno', code: 'M07' }];

const stop = (n: number, kind: EagleStop['kind'], name: string, time_in: string, time_out: string, minutes: number, geo: [number, number],
  extra: Partial<EagleStop> = {}): EagleStop => ({
  n, kind, name, code: `C${100 + n}`, time_in, time_out, minutes, geo, distance_m: 35, within_geofence: true, planned: true,
  feedback: '', remarks: '', category: kind === 'customer' ? 'Retail' : '', speciality: kind === 'doctor' ? 'Physician' : '',
  hq: 'Mumias', area: '', visited_with: '', detailing: 0, samples: 0, gifts: 0, photo: false, activities: [],
  order_amount: 0, sales_amount: 0, ...extra,
});

const STOPS: EagleStop[] = [
  stop(1, 'doctor', 'Dr. Agnes Wekesa', '08:41', '08:58', 17, [0.3372, 34.4952], { detailing: 3, samples: 2, area: 'Mumias Level 4 Hospital' }),
  stop(2, 'doctor', 'Dr. Peter Oduor', '09:15', '09:31', 16, [0.3301, 34.5051], { detailing: 2, area: "St Mary's Mission" }),
  stop(3, 'customer', 'Mumias Health Pharmacy', '10:02', '10:20', 18, [0.3329, 34.5194],
    { activities: [{ kind: 'Order', amount: 18600, time: '10:11' }], area: 'Mumias' }),
  stop(4, 'customer', 'Western Springs', '12:58', '13:00', 2, [0.3121, 34.5652], { feedback: 'Shop closed', remarks: 'Shop closed to call later', activities: [{ kind: 'Feedback', amount: '', time: '12:59' }] }),
  stop(5, 'customer', 'Haggai Shop Bungasi', '13:00', '13:09', 9, [0.3062, 34.5761], { activities: [{ kind: 'Order', amount: 26830, time: '13:05' }], area: 'Bungasi' }),
  stop(6, 'customer', 'Livewire Musanda', '13:17', '13:28', 11, [0.2964, 34.5873], { feedback: 'No order', remarks: 'No order till next week' }),
  stop(7, 'customer', 'Tumaini 2 Ibinda', '13:32', '13:44', 12, [0.2889, 34.5941], {
    photo: true, category: 'Wholesale', area: 'Ibinda', feedback: 'Credit', remarks: 'Wants credit terms reviewed next visit',
    activities: [{ kind: 'Order', amount: 31450, time: '13:36' }, { kind: 'Feedback', amount: '', time: '13:43' }],
  }),
  stop(8, 'customer', 'Mahitaji Ibinda', '13:45', '13:49', 4, [0.2851, 34.6013], { within_geofence: false, distance_m: 1200, remarks: 'To check later today noon' }),
  stop(9, 'customer', 'Dubai Wholesale Buhuru', '13:49', '13:54', 5, [0.2766, 34.6087], { remarks: 'Not in the shop to call later' }),
  stop(10, 'customer', 'Jesus Is Lord Buhuru', '13:59', '14:01', 2, [0.2714, 34.6051], { remarks: 'Shop closed, gone to prayer day' }),
  stop(11, 'customer', 'Mabidii Enterprise Buhuru', '14:06', '14:09', 3, [0.2687, 34.5992], { remarks: 'Shop closed, prayer day' }),
  stop(12, 'doctor', 'Dr. Salma Hussein', '15:10', '15:31', 21, [0.2151, 34.4987], { detailing: 3, samples: 4, area: 'Butere Sub-County Hospital' }),
];

function track(): [number, number, string][] {
  const pts: [number, number][] = [[0.3356, 34.4886], ...STOPS.map((s) => s.geo!), [0.2069, 34.4906]];
  const out: [number, number, string][] = [];
  let minute = 8 * 60 + 12;
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < 4; k++) {  // a few points between stops, with a little wobble like a real road
      const f = k / 4; const w = Math.sin((i + 1) * (k + 2)) * 0.0012;
      const lat = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f + w; const lng = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f - w;
      const h = Math.floor(minute / 60); const m = minute % 60;
      out.push([+lat.toFixed(5), +lng.toFixed(5), `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`]);
      minute += 9;
    }
  }
  out.push([0.2069, 34.4906, '17:36']);
  return out;
}

export function sampleEagle(rep: string, date: string): EaglePayload {
  const base = { report: 'eagle_eye', title: 'Eagle Eye View', path: '/EagelEyeView', columns: [], rows: [], total: 0, page: 1, size: 0,
    from: date, to: date, users: USERS, rep, date } as unknown as EaglePayload;
  if (!rep) return base;
  return {
    ...base, total: STOPS.length,
    day: { start: '08:12', end: '17:36', start_battery: '86%', end_battery: '31%', start_geo: [0.3356, 34.4886] },
    track: track(), last: { geo: [0.2069, 34.4906], time: '17:36' }, stops: STOPS,
    gaps: [{ before: 4, from: '10:20', to: '12:58', minutes: 158 }],
    totals: { customers: 9, doctors: 3, service: 0, orders: 3, order_value: 76880, distance_km: 46.2, minutes_at_stops: 120, minutes_working: 564 },
  };
}
