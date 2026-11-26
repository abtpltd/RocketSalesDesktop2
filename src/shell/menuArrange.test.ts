import { describe, expect, it } from 'vitest';
import { ALLOC_PATH, arrangeMenu, openOne } from './menuArrange';

const item = (path: string, title = path) => ({ id: path, title, path });
const gifts = (...paths: string[]) => ({ id: 'gifts', title: 'Gift & Samples', icon: 'gifts', items: paths.map((p) => item(p)) });
const paths = (s: { items: { path: string }[] }) => s.items.map((i) => i.path);

const by = (r: ReturnType<typeof arrangeMenu>, id: string) => r.sections.find((x) => x.id === id)!;

describe('desktop menu arrangement', () => {
  it('puts gift and sample pages where the back office menu has them and joins the two allocation pages', () => {
    const r = arrangeMenu([gifts('/Transactions/SampleAllocationGrid', '/Transactions/GiftAllocationGrid', '/Transactions/GiftAndSampleStockRequest',
      '/Transactions/SampleStock', '/Transactions/GiftStock', '/master/GiftMaster', '/Samples', '/Other')], new Set());
    expect(paths(by(r, 'transactions'))).toEqual([ALLOC_PATH, '/Transactions/GiftAndSampleStockRequest']);
    expect(paths(by(r, 'stock'))).toEqual(['/Transactions/SampleStock', '/Transactions/GiftStock']);
    expect(paths(by(r, 'products'))).toEqual(['/master/GiftMaster', '/Samples', '/Other']); // an unknown page stays with its section
    expect(r.allocKinds).toEqual(['gift', 'sample']);
  });
  it('keeps only the allocation the role has, and leaves a classic-window page apart', () => {
    expect(arrangeMenu([gifts('/Transactions/SampleAllocationGrid')], new Set()).allocKinds).toEqual(['sample']);
    const r = arrangeMenu([gifts('/Transactions/SampleAllocationGrid', '/Transactions/GiftAllocationGrid')], new Set(['/Transactions/GiftAllocationGrid']));
    expect(r.allocKinds).toEqual(['sample']);
    expect(paths(by(r, 'transactions'))).toEqual(['/Transactions/GiftAllocationGrid', ALLOC_PATH]);
  });
  it('without allocation pages there is no joined entry', () => {
    const r = arrangeMenu([gifts('/master/GiftMaster')], new Set());
    expect(r.allocKinds).toEqual([]);
    expect(paths(r.sections[0])).toEqual(['/master/GiftMaster']);
  });
  it('puts machines and spare parts under Master > Products', () => {
    const r = arrangeMenu([{ id: 'machines', title: 'Machine & Equipments', icon: 'machines', items: [item('/master/MachineAndEquipmentMaster'), item('/master/SpareParts')] }], new Set());
    expect(by(r, 'products').parent).toBe('master');
    expect(paths(by(r, 'products'))).toEqual(['/master/MachineAndEquipmentMaster', '/master/SpareParts']);
  });
  it('moves + Add Service Call onto the Service Calls list', () => {
    const svc = { id: 'services', title: 'Services', icon: 'services', items: [item('/Report/ServiceCallReport'), item('/Utility/ServiceCall')] };
    const r = arrangeMenu([svc], new Set());
    expect(r.serviceAdd).toBe(true);
    expect(paths(r.sections[0])).toEqual(['/Report/ServiceCallReport']);
    const alone = arrangeMenu([{ ...svc, items: [item('/Utility/ServiceCall')] }], new Set());
    expect(alone.serviceAdd).toBe(false);
    expect(paths(alone.sections[0])).toEqual(['/Utility/ServiceCall']);
    expect(arrangeMenu([svc], new Set(['/Report/ServiceCallReport'])).serviceAdd).toBe(false);
  });
  it('calls Base Pricing Price Lists, and Update Price goes to Utility', () => {
    const r = arrangeMenu([{ id: 'products', title: 'Products & Pricing', icon: 'tag', items: [item('/master/BasePricing', 'Base Pricing'), item('/Utility/UpdatePriceAndDiscount', 'Update Price')] }], new Set());
    expect(by(r, 'products').items.map((i) => i.title)).toEqual(['Price Lists']);
    expect(by(r, 'utility').items.map((i) => i.title)).toEqual(['Master Pricelist']);
  });
  it('gathers the user and role pages into Users & Roles, before Settings & Admin', () => {
    const r = arrangeMenu([
      { id: 'field', title: 'Field Force', icon: 'fieldforce', items: [item('/master/MobileVanUser'), item('/Visits')] },
      { id: 'settings', title: 'Settings & Admin', icon: 'settings', items: [item('/master/CustomizeRoleAccess'), item('/master/AppUser'), item('/master/AppUserSettings')] },
    ], new Set());
    expect(r.sections.map((s) => s.id)).toEqual(['utility', 'users-roles']);
    expect(r.sections[1].title).toBe('Users & Roles');
    expect(paths(r.sections[1])).toEqual(['/master/MobileVanUser', '/master/AppUserSettings', '/master/AppUser', '/master/CustomizeRoleAccess']);
    expect(paths(r.sections[0])).toEqual(['/Visits']);
  });
  it('puts Pipeline Settings next to the Pipeline Dashboard', () => {
    const r = arrangeMenu([{ id: 'sales', title: 'Sales', icon: 'x', items: [item('/a'), item('/PipelineDashbord'), item('/b')] },
      { id: 'settings', title: 'Settings', icon: 'y', items: [item('/Pipeline/Settings'), item('/c')] }], new Set());
    expect(paths(by(r, 'prospects'))).toEqual(['/PipelineDashbord', '/Pipeline/Settings']);
    expect(paths(by(r, 'transactions'))).toEqual(['/a', '/b']);
    expect(paths(by(r, 'settings'))).toEqual(['/c']);
  });
  it('keeps Pipeline Settings alone when there is no Pipeline Dashboard', () => {
    const r = arrangeMenu([{ id: 'settings', title: 'Settings', icon: 'y', items: [item('/Pipeline/Settings')] }], new Set());
    expect(paths(r.sections[0])).toEqual(['/Pipeline/Settings']);
  });
  it('follows the back office menu: Transactions, Stock, Reports, Pipeline, Utility, Master, Settings', () => {
    const sec = (id: string, title: string, ...p: string[]) => ({ id, title, icon: 'x', items: p.map((x) => item(x)) });
    const r = arrangeMenu([sec('settings', 'Settings & Admin', '/Settings'), sec('customers', 'Customers', '/master/Client'), sec('doctors', 'Doctors', '/master/Doctors'),
      sec('products', 'Products & Pricing', '/Utility/UpdatePriceAndDiscount', '/master/BasePricing', '/master/Product'), sec('sales', 'Sales & Orders', '/OrderGrid'),
      sec('extra', 'Extra', '/x'), sec('field', 'Field Force', '/EagelEyeView', '/Utility/LeaveManagement'), sec('prospects', 'Prospects', '/ProspectGrid'),
      sec('reports', 'Reports', '/Report/DCR'), sec('inventory', 'Stock', '/Transactions/SampleStock')], new Set());
    expect(r.sections.map((x) => x.id)).toEqual(['transactions', 'stock', 'reports', 'prospects', 'utility', 'customers', 'doctors', 'products', 'master-misc', 'settings']);
    expect(paths(by(r, 'products'))).toEqual(['/master/Product', '/master/BasePricing']);
    expect(by(r, 'products').title).toBe('Products');
  });
  it('calls the role page Backoffice Roles', () => {
    const r = arrangeMenu([{ id: 'settings', title: 'S', icon: 'x', items: [item('/master/CustomizeRoleAccess', 'Backoffice Users Role')] }], new Set());
    const all = r.sections.flatMap((x) => x.items);
    expect(all.find((i) => i.path === '/master/CustomizeRoleAccess')?.title).toBe('Backoffice Roles');
  });
  it('gathers the Master sub-menus and the Utility pages (Eagle Eye View included)', () => {
    const sec = (id: string, title: string, ...p: string[]) => ({ id, title, icon: 'x', items: p.map((x) => item(x)) });
    const r = arrangeMenu([sec('sales', 'Sales & Orders', '/OrderGrid', '/Sales/CreateSalesOrder'), sec('targets', 'Targets', '/Utility/TargetEntry', '/Report/T'),
      sec('field', 'Field Force', '/EagleEyeView', '/Visits'), sec('gifts', 'Gift & Samples', '/master/GiftMaster'), sec('customers', 'Customers', '/master/Client'),
      sec('settings', 'Settings & Admin', '/master/NoticeBoard', '/Settings')], new Set());
    expect(paths(by(r, 'utility'))).toEqual(['/Utility/TargetEntry', '/EagleEyeView', '/Visits']);
    expect(by(r, 'utility').parent).toBeUndefined();
    expect(by(r, 'customers').parent).toBe('master');
    expect(paths(by(r, 'marketing'))).toEqual(['/master/NoticeBoard']);
    expect(paths(by(r, 'reports'))).toEqual(['/Report/T']);
    expect(paths(by(r, 'transactions'))).toEqual(['/OrderGrid']); // "+ New Sales Order" is a button of the list
    expect(paths(by(r, 'settings'))).toEqual(['/Settings']);
  });
  it('keeps "+ New Sales Order" when the role has no Orders list', () => {
    const r = arrangeMenu([{ id: 'sales', title: 'Sales', icon: 'x', items: [item('/Sales/CreateSalesOrder')] }], new Set());
    expect(paths(r.sections[0])).toEqual(['/Sales/CreateSalesOrder']);
  });
  it('keeps one top menu open, and a sub-menu keeps its parent open', () => {
    const subOf = new Map([['customers', 'master']]);
    expect(openOne(['sales'], [], subOf)).toEqual(['sales']);
    expect(openOne(['sales', 'reports'], ['sales'], subOf)).toEqual(['reports']);
    expect(openOne(['reports', 'master', 'customers'], ['reports', 'master'], subOf)).toEqual(['master', 'customers']);
    expect(openOne(['master'], ['master', 'customers'], subOf)).toEqual(['master']);
  });
});
