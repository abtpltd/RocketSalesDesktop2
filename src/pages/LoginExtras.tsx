import { useEffect, useState } from 'react';
import {
  AimOutlined, AuditOutlined, BarChartOutlined, BulbOutlined, CameraOutlined, CarOutlined, EditOutlined, EnvironmentOutlined,
  ExperimentOutlined, ScheduleOutlined, ShoppingCartOutlined, ToolOutlined,
} from '@ant-design/icons';
import type { Thought } from '../api/types';
import { useSession } from '../session';
import { pickQuote } from '../ui/dailyQuote';

const KEY = 'thought-of-the-day';
const readSaved = (): Thought | null => { try { const t = localStorage.getItem(KEY); return t ? (JSON.parse(t) as Thought) : null; } catch { return null; } };
const save = (t: Thought) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* optional */ } };

/** The thought of the day set on the web support settings page. The last one seen shows at once, then it refreshes. */
export function ThoughtOfTheDay({ company }: { company: string }) {
  const { api } = useSession();
  const [t, setT] = useState<Thought | null>(readSaved);
  useEffect(() => {
    let live = true;
    api.fetchThought(company).then((x) => { if (live && x && (x.text || x.line1 || x.line2)) { setT(x); save(x); } }).catch(() => { /* keep the saved one */ });
    return () => { live = false; };
  }, [api, company]);
  // the company's own thought wins; on the other days one of the bundled quotes from sales coaches
  const own = !!t && !!(t.text || t.line1 || t.line2);
  const [q] = useState(() => (own ? null : pickQuote())); // chosen once each time the sign-in screen opens
  const shown: Thought | null = own ? t : q ? { line1: '', line2: '', text: q.text, author: `— ${q.author}` } : null;
  if (!shown) return null;
  return (
    <figure className="thought">
      <div className="thought-head"><span className="thought-icon" aria-hidden><BulbOutlined /></span>Thought of the day</div>
      {shown.line1 && <div className="thought-line1">{shown.line1}</div>}
      {shown.text && <blockquote>{shown.text}</blockquote>}
      {shown.author && <figcaption>{shown.author}</figcaption>}
      {shown.line2 && <div className="thought-line2">{shown.line2}</div>}
    </figure>
  );
}

const SFA: [React.ReactNode, string][] = [
  [<ScheduleOutlined />, 'Route plans and daily attendance'],
  [<EnvironmentOutlined />, 'Geotagged customer and doctor visits'],
  [<ExperimentOutlined />, 'Detailing, samples and gifts'],
  [<ShoppingCartOutlined />, 'Orders, collections and stock'],
];
const SERVICE: [React.ReactNode, string][] = [
  [<ToolOutlined />, 'Service calls and machines'],
  [<CarOutlined />, 'Engineer visits and vehicle checks'],
  [<CameraOutlined />, 'On-site checklists and photos'],
  [<EditOutlined />, 'Customer sign-off and history'],
];

/** What the platform does, as a picture: two field apps feeding one back office. */
export function SolutionInfographic() {
  return (
    <div className="infographic" aria-label="RocketSales: the sales force app and the service app feed one back office">
      <div className="ig-apps">
        <section className="ig-app">
          <div className="ig-app-head"><span className="ig-badge"><AimOutlined /></span><div><b>Sales Force App</b><small>For medical reps and sales teams</small></div></div>
          <ul>{SFA.map(([icon, text]) => <li key={text}><span>{icon}</span>{text}</li>)}</ul>
        </section>
        <section className="ig-app">
          <div className="ig-app-head"><span className="ig-badge"><ToolOutlined /></span><div><b>Service App</b><small>For engineers in the field</small></div></div>
          <ul>{SERVICE.map(([icon, text]) => <li key={text}><span>{icon}</span>{text}</li>)}</ul>
        </section>
      </div>
      <svg className="ig-join" viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden>
        <path d="M100 0 C100 26 200 18 200 44 M300 0 C300 26 200 18 200 44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
      </svg>
      <section className="ig-hub">
        <span className="ig-badge"><BarChartOutlined /></span>
        <div><b>Back office</b><small>Approvals, masters, reports and live dashboards</small></div>
        <span className="ig-ai"><AuditOutlined /> AI insights</span>
      </section>
    </div>
  );
}

/** Copyright line under the sign-in card: the year follows the clock, the version comes from the installed app. */
export function Copyright() {
  const { api } = useSession();
  const [v, setV] = useState('');
  useEffect(() => { let live = true; api.appVersion().then((x) => { if (live) setV(x); }).catch(() => { /* version left out */ }); return () => { live = false; }; }, [api]);
  return <div className="copyright">© {new Date().getFullYear()} Maxpro Infotech Limited. All rights reserved.{v && <> <span className="copyright-v">Version {v}</span></>}</div>;
}
