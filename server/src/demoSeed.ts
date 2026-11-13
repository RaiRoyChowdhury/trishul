// Fictional demo volunteers (Shakti Network). Never real people. Re-seeded by the admin "Reset demo data" action.
export const DEMO_VOLUNTEER_SEED = [
  { display_name: 'Ananya Sen', area: 'Location A' }, { display_name: 'Riya Das', area: 'Location A' },
  { display_name: 'Priya Kumari', area: 'Location B' }, { display_name: 'Meera Singh', area: 'Location B', training_status: 'in_progress', safeguarding_status: 'pending', available: false },
  { display_name: 'Suman Jha', area: 'Location C' }, { display_name: 'Kavita Roy', area: 'Location C' },
].map(v => ({ verification_status: 'demo', training_status: 'completed', safeguarding_status: 'cleared', available: true, ...v, is_demo: true }));
