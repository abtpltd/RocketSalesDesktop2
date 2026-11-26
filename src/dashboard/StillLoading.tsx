import { useEffect, useState } from 'react';
import { Spin } from 'antd';

/** The dashboard can take up to two minutes on a big company; say so after 15 seconds so it does not look stuck. */
export default function StillLoading({ after = 15 }: { after?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), after * 1000);
    return () => clearTimeout(t);
  }, [after]);
  return (
    <div className="center-screen" style={{ height: 260, flexDirection: 'column', gap: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large"><div style={{ padding: 30 }} /></Spin>
      <div className="muted">{slow ? 'Still loading. A large company can take up to two minutes. Please wait...' : 'Loading the dashboard...'}</div>
    </div>
  );
}
