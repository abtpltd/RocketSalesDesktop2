import { Select } from 'antd';
import { TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { GridInfo } from '../api/types';
import { joinPicks, keepUsers, splitPicks, usersFor } from './gridPicks';

/**
 * Manager and App User filters for grids whose rows name app users. Both take several choices at once (kept in one
 * text value, separated by "|"). Choosing managers narrows the app users offered.
 */
export default function GridFilters({ grid, manager, appUser, onChange, showAppUser = true }: {
  grid: GridInfo; manager: string; appUser: string; onChange: (manager: string, appUser: string) => void; showAppUser?: boolean;
}) {
  const managers = splitPicks(manager);
  const chosen = splitPicks(appUser);
  const users = usersFor(grid.app_users, managers);
  return (
    <>
      <Select mode="multiple" showSearch allowClear maxTagCount="responsive" placeholder="All managers" style={{ minWidth: 220, maxWidth: 420 }} value={managers}
        suffixIcon={<TeamOutlined />} aria-label="Manager" optionFilterProp="label"
        options={grid.managers.map((m) => ({ value: m, label: m }))}
        onChange={(v: string[]) => onChange(joinPicks(v), joinPicks(keepUsers(chosen, grid.app_users, v)))} />
      {showAppUser && (
        <Select mode="multiple" showSearch allowClear maxTagCount="responsive" placeholder="All app users" style={{ minWidth: 240, maxWidth: 440 }} value={chosen}
          suffixIcon={<UserOutlined />} aria-label="App user" optionFilterProp="label"
          options={users.map((u) => ({ value: u.code || u.name, label: u.code && u.code !== u.name ? `${u.name} (${u.code})` : u.name }))}
          onChange={(v: string[]) => onChange(manager, joinPicks(v))} />
      )}
    </>
  );
}
