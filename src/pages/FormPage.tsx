import { Button } from 'antd';
import RecordForm from '../ui/RecordForm';
import { PageHeader } from '../ui/parts';
import { FORM_PAGES } from '../ui/formsMap';

/** A page that is one form: company settings (saved over the current values) or one new entry. */
export default function FormPage({ page, title, classicPath, openClassic }: {
  page: string; title: string; classicPath: string; openClassic: (path: string) => void;
}) {
  const meta = FORM_PAGES[page];
  return (
    <>
      <PageHeader title={title} meta={meta.intro}
        actions={<Button onClick={() => openClassic(classicPath)}>Open in classic window</Button>} />
      <RecordForm key={page} name={meta.form} recordKey={null} open inline mode={meta.mode} onClose={() => undefined} />
    </>
  );
}
