/** Master lists that have an add / edit form in the desktop app (list module -> form on the server). */
export const FORM_FOR_LIST: Record<string, { form: string; edit: boolean; add: boolean; presets?: Record<string, unknown> }> = {
  products: { form: 'products', edit: true, add: true },
  // samples are products marked "Sample product": the same product form
  samples: { form: 'products', edit: true, add: true, presets: { sample: true } },
  customers: { form: 'customers', edit: true, add: true },
  doctors: { form: 'doctors', edit: true, add: true },
  gifts: { form: 'gifts', edit: true, add: true },
  stores: { form: 'stores', edit: false, add: true },
  backoffice_users: { form: 'backoffice_users', edit: true, add: false },
  app_users: { form: 'app_users', edit: true, add: true },
  prospects_grid: { form: 'prospects_grid', edit: true, add: true },
  machines: { form: 'machines', edit: true, add: true },
  app_events: { form: 'app_events', edit: true, add: true },
  base_pricing: { form: 'base_pricing', edit: false, add: true },
  vehicle_checklists: { form: 'vehicle_checklists', edit: true, add: true },
};

/** Pages that are a single form (settings, or "submit one entry"), not a list. */
export const FORM_PAGES: Record<string, { form: string; mode: 'settings' | 'entry'; intro: string }> = {
  notice_board: { form: 'notice_board', mode: 'settings', intro: 'The notice shown to field users in the app.' },
  pipeline_settings: { form: 'pipeline_settings', mode: 'settings', intro: 'The stages a prospect moves through.' },
  management_review: { form: 'management_review', mode: 'entry', intro: 'Write or replace the review for one sales rep and one day.' },
};
