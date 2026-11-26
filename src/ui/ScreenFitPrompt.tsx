import { useEffect, useState } from 'react';
import { Button, Modal } from 'antd';
import { useTheme } from '../theme';
import { CLASS_LABEL, SIZE_LABEL, readAnswered, remember, suggest, type Suggestion } from '../screenFit';

/** Once per kind of screen: "This looks like a large screen. Text size Large usually fits best." The person decides. */
export default function ScreenFitPrompt() {
  const { textSize, setTextSize } = useTheme();
  const [s, setS] = useState<Suggestion | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      // a moment after start or after the window moved to another screen, so it never lands on top of the sign-in
      timer = window.setTimeout(() => setS(suggest(window.screen.width, window.screen.height, textSize, readAnswered())), 1500);
    };
    check();
    window.addEventListener('resize', check);
    return () => { window.clearTimeout(timer); window.removeEventListener('resize', check); };
  }, [textSize]);

  if (!s) return null;
  const close = () => { remember(s.cls); setS(null); };
  return (
    <Modal open centered width={460} title="Best fit for this screen" onCancel={close} maskClosable={false}
      footer={[
        <Button key="keep" onClick={close}>Keep {SIZE_LABEL[textSize].split(' ')[0]}</Button>,
        <Button key="use" type="primary" onClick={() => { setTextSize(s.size); close(); }}>Use {SIZE_LABEL[s.size].split(' ')[0]}</Button>,
      ]}>
      <p>This looks like {CLASS_LABEL[s.cls]} ({s.width} × {s.height}). Text size <b>{SIZE_LABEL[s.size]}</b> usually fits it best.</p>
      <p className="muted">You can change it any time from the top bar menu. We ask once for each kind of screen.</p>
    </Modal>
  );
}
