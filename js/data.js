// Static game data: terrain, depth tiers, commodities, buildings, technologies, objectives.
export const N = 36;
export const START_CASH = 10e6;
export const WIN_NET_WORTH = 500e6;

export const T = { DEEP: 0, SHALLOW: 1, GRASS: 2, DESERT: 3, TUNDRA: 4, MOUNTAIN: 5 };
export const TERRAIN = [
  { name: 'Deep Sea', sea: true, drill: 3.6 },
  { name: 'Shallow Sea', sea: true, drill: 2.3 },
  { name: 'Grassland', drill: 1.1 },
  { name: 'Desert', drill: 1.0 },
  { name: 'Tundra', drill: 1.5 },
  { name: 'Mountains', drill: 0 },
];

export const TIERS = [
  { name: 'Shallow', depth: 1200, cost: 0.8e6, oilRate: 200, gasRate: 5000 },
  { name: 'Medium', depth: 2600, cost: 2.0e6, oilRate: 450, gasRate: 12000 },
  { name: 'Deep', depth: 4200, cost: 4.5e6, oilRate: 1000, gasRate: 26000 },
];

// store: which storage pool the commodity uses. depth: market depth for price impact.
export const COMMS = {
  crude: { name: 'Crude Oil', unit: 'bbl', color: '#f2a03d', store: 'crude', depth: 150e3, lot: 5000 },
  gas: { name: 'Natural Gas', unit: 'mcf', color: '#4fd1c5', store: 'gas', depth: 4e6, lot: 100000 },
  gasoline: { name: 'Gasoline', unit: 'bbl', color: '#ef6461', store: 'prod', depth: 100e3, lot: 3000 },
  diesel: { name: 'Diesel', unit: 'bbl', color: '#f6d55c', store: 'prod', depth: 100e3, lot: 3000 },
  jet: { name: 'Jet Fuel', unit: 'bbl', color: '#8fb8ff', store: 'prod', depth: 60e3, lot: 3000 },
  chem: { name: 'Petrochemicals', unit: 'bbl', color: '#c58af9', store: 'prod', depth: 50e3, lot: 2000 },
  lng: { name: 'LNG', unit: 'mcf', color: '#9be7ff', store: null, depth: 4e6, lot: 0 },
};
export const STOCKED = ['crude', 'gas', 'gasoline', 'diesel', 'jet', 'chem'];

export const BUILDINGS = {
  hq: { name: 'Head Office', icon: '🏢', cost: 0, opex: 0, crudeCap: 8000, prodCap: 4000, depot: true,
    desc: 'Your headquarters. Small tank yard and truck depot.' },
  well: { name: 'Production Well', icon: '🛢️', cost: 0.6e6, opex: 900, days: 8 },
  tank: { name: 'Tank Farm', icon: '🪣', cost: 1.2e6, opex: 400, days: 10, crudeCap: 30000, prodCap: 20000, depot: true,
    desc: '+30k bbl crude and +20k bbl product storage. Works as a truck depot for nearby wells.' },
  refinery: { name: 'Refinery', icon: '🏭', cost: 7e6, opex: 7000, days: 40, crudeCap: 5000, prodCap: 8000, depot: true,
    desc: 'Turns 1,200 bbl/day of crude into gasoline, diesel and jet fuel. Switch its focus to chase prices.' },
  gasplant: { name: 'Gas Plant', icon: '🔥', cost: 3.5e6, opex: 1500, days: 25, gasCap: 80000, gasProc: 20000,
    desc: 'Captures up to 20,000 mcf/day of gas instead of flaring it, with 80k mcf of storage.' },
  terminal: { name: 'Export Terminal', icon: '🚢', cost: 8e6, opex: 2500, days: 30, crudeCap: 20000, prodCap: 20000, depot: true, coastal: true,
    desc: 'Tanker access to world markets: +8% on every sale. Coastal tiles only.' },
  petchem: { name: 'Petrochemical Plant', icon: '🧪', cost: 14e6, opex: 10000, days: 50, prodCap: 6000, tech: 'petchem',
    desc: 'Cracks 400 bbl crude + 2,000 mcf gas a day into 450 bbl of high-value petrochemicals.' },
  lng: { name: 'LNG Terminal', icon: '❄️', cost: 18e6, opex: 12000, days: 60, gasCap: 40000, tech: 'lng', coastal: true,
    desc: 'Liquefies and exports up to 12,000 mcf/day of gas at the premium LNG price. Coastal tiles only.' },
};
export const BUILD_MENU = ['tank', 'gasplant', 'refinery', 'terminal', 'petchem', 'lng'];
export const PLATFORM = { cost: 5e6, costDeep: 9e6, opex: 6500, days: 25 };
export const REFINERY_MODES = {
  balanced: { name: 'Balanced', gasoline: 0.45, diesel: 0.33, jet: 0.22 },
  gasoline: { name: 'Max gasoline', gasoline: 0.62, diesel: 0.24, jet: 0.14 },
  diesel: { name: 'Max diesel', gasoline: 0.3, diesel: 0.55, jet: 0.15 },
  jet: { name: 'Max jet fuel', gasoline: 0.3, diesel: 0.25, jet: 0.45 },
};

export const TECHS = [
  { id: 'seismic3d', name: '3D Seismic', cost: 2e6, days: 40, desc: 'Surveys cover 7×7 tiles, read deep fields clearly, show depth, and stop giving false anomalies.' },
  { id: 'bits', name: 'Diamond Drill Bits', cost: 1.5e6, days: 30, desc: 'Drilling is 40% faster and 15% cheaper.' },
  { id: 'bop', name: 'Blowout Preventers', cost: 1.5e6, days: 30, desc: 'Cuts blowout risk while drilling by 85%.' },
  { id: 'horizontal', name: 'Horizontal Drilling', cost: 4e6, days: 60, req: 'bits', desc: 'Every well produces 35% more.' },
  { id: 'eor', name: 'Enhanced Oil Recovery', cost: 6e6, days: 80, req: 'horizontal', desc: 'Water flooding: +25% recoverable oil in every field and a much gentler decline.' },
  { id: 'deepwater', name: 'Deepwater Engineering', cost: 8e6, days: 90, req: 'bop', desc: 'Drill and build platforms in the deep sea, where the giants hide.' },
  { id: 'pipes', name: 'Smart Pipelines', cost: 2e6, days: 40, desc: 'Pipelines cost 40% less and never leak.' },
  { id: 'cracking', name: 'Catalytic Cracking', cost: 5e6, days: 60, desc: 'Refineries process 25% more crude and waste far less of it.' },
  { id: 'petchem', name: 'Petrochemistry', cost: 6e6, days: 70, req: 'cracking', desc: 'Unlocks the Petrochemical Plant.' },
  { id: 'lng', name: 'Gas Liquefaction', cost: 7e6, days: 80, desc: 'Unlocks the LNG Terminal.' },
  { id: 'ccs', name: 'Carbon Capture', cost: 9e6, days: 100, desc: 'Exempt from carbon taxes, flaring hurts half as much, and reputation recovers faster.' },
  { id: 'ai', name: 'AI Reservoir Modelling', cost: 10e6, days: 100, req: 'seismic3d', desc: 'Every 150 days your geologists pinpoint one undiscovered field for free.' },
];

export const OBJECTIVES = [
  { id: 'survey', text: 'Commission a seismic survey', reward: 100e3 },
  { id: 'drill', text: 'Spud an exploration well', reward: 150e3 },
  { id: 'strike', text: 'Strike oil or gas', reward: 300e3 },
  { id: 'produce', text: 'Bring a well into production', reward: 200e3 },
  { id: 'prod10k', text: 'Produce 10,000 barrels of oil', reward: 300e3 },
  { id: 'tank', text: 'Build a Tank Farm', reward: 300e3 },
  { id: 'research', text: 'Complete a research project', reward: 400e3 },
  { id: 'refinery', text: 'Bring a Refinery online', reward: 1e6 },
  { id: 'contract', text: 'Fulfil a supply contract', reward: 500e3 },
  { id: 'gas', text: 'Capture gas with a Gas Plant', reward: 500e3 },
  { id: 'offshore', text: 'Bring an offshore platform online', reward: 2e6 },
  { id: 'nw100', text: 'Reach $100M net worth', reward: 3e6 },
  { id: 'nw500', text: 'Become an Oil Baron: $500M net worth', reward: 0 },
];

export const RANKS = [
  [0, 'Wildcatter'], [20e6, 'Operator'], [50e6, 'Independent'], [120e6, 'Mid-Major'], [250e6, 'Major'], [500e6, 'Oil Baron'],
];
