import { useState } from 'react';
import { Button, Drawer } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { AccessProvider, useAccess, useCan } from '../../access';
import ReportTable from '../ReportTable';
import ServiceCallsPage from './ServiceCallsPage';

export const ADD_CALL_PATH = '/Utility/ServiceCall';

/**
 * Service Calls: the list of calls, with "+ Add Service Call" on the same screen (the scheduling form opens beside the
 * list). The button shows only when the role has the web's Service Call page, and follows that page's rights.
 */
export default function ServiceCallsList({ classicPath, openClassic, canAdd }: { classicPath: string; openClassic: (p: string) => void; canAdd: boolean }) {
  const access = useAccess();
  const allowed = useCan('create', ADD_CALL_PATH) && canAdd;
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const close = () => { setOpen(false); void qc.invalidateQueries({ queryKey: ['report', 'service_calls'] }); };
  return (
    <>
      <ReportTable name="service_calls" noun="calls" classicPath={classicPath} openClassic={openClassic}
        extra={allowed ? <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Add Service Call</Button> : null} />
      <Drawer open={open} onClose={close} title="Add Service Call" size={Math.min(980, window.innerWidth)} destroyOnHidden>
        <AccessProvider access={access} path={ADD_CALL_PATH}>
          <ServiceCallsPage classicPath={ADD_CALL_PATH} openClassic={openClassic} />
        </AccessProvider>
      </Drawer>
    </>
  );
}
