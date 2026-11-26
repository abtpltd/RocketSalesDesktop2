import { useEffect } from 'react';
import { Spin } from 'antd';
import { useSession } from './session';
import Login from './pages/Login';
import Shell from './shell/Shell';
import Guard from './security/Guard';

export default function App() {
  const { state, restore } = useSession();
  useEffect(() => { void restore(); }, [restore]);
  if (state.status === 'loading') {
    return <div className="center-screen"><Spin size="large" description="Starting..."><div style={{ padding: 40 }} /></Spin></div>;
  }
  return state.status === 'in' ? <Guard info={state.info}><Shell info={state.info} /></Guard> : <Login notice={state.notice} />;
}
