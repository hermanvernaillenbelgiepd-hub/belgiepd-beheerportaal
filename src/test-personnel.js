
const members = [
  {
    personId: '111111111111111111',
    name: 'Test Beheerder',
    dept: 'politie',
    call: 'TEST-P101',
    rank: 'Commissaris',
    series: 'Officierenkader'
  },
  {
    personId: '222222222222222222',
    name: 'Test Medewerker',
    dept: 'politie',
    call: 'TEST-P202',
    rank: 'Inspecteur',
    series: 'Basiskader'
  },
  {
    personId: '222222222222222222',
    name: 'Test Medewerker',
    dept: 'ambulance',
    call: 'TEST-A202',
    rank: 'Ambulancier',
    series: 'Basiskader'
  },
  {
    personId: '333333333333333333',
    name: 'Test Ambulancier',
    dept: 'ambulance',
    call: 'TEST-A303',
    rank: 'Ambulancier',
    series: 'Basiskader'
  }
];

export function createTestPersonnel() {
  return members.map(p => ({
    id: `${p.dept}:${p.personId}`,
    personId: p.personId,
    name: p.name,
    call: p.call,
    dept: p.dept,
    rank: p.rank,
    series: p.series,
    seriesRaw: 'TEST',
    status: 'Actief',
    specialties: [],
    special: 'Geen geregistreerde specialisaties',
    hours: null,
    totalHours: null,
    last: null,
    lastConnection: null,
    lastCheck: null,
    activityStatus: null,
    lastPing: null,
    pingCount: null,
    pingResponses: null
  }));
}
