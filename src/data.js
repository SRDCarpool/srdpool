// Static app constants. Members, rides and places now come from the API.

export const PREFS = {
  ac: { label: 'AC', emoji: '❄️' },
  luggage: { label: 'Luggage space', emoji: '🧳' },
  nosmoking: { label: 'No smoking', emoji: '🚭' },
  music: { label: 'Music OK', emoji: '🎵' },
  pets: { label: 'Pets OK', emoji: '🐾' },
  women: { label: 'Women only', emoji: '👩' },
  quiet: { label: 'Quiet ride', emoji: '🤫' },
};

export const VEHICLE_TYPES = ['Hatchback', 'Sedan', 'SUV', 'EV'];

export const COMMUNITIES = [
  { id: 'hitec_park', name: 'HITEC City IT Park', type: 'Office', members: 1240, domain: 'company email' },
  { id: 'jntu', name: 'JNTU Hyderabad', type: 'College', members: 860, domain: 'college email' },
  { id: 'myhome', name: 'My Home Jewel Apartments', type: 'Apartment', members: 310, domain: 'flat number' },
];
