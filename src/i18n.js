import { useStore } from './store';

export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'te', label: 'తెలుగు' },
  { id: 'hi', label: 'हिन्दी' },
];

const T = {
  home: { en: 'Home', te: 'హోమ్', hi: 'होम' },
  find: { en: 'Find Ride', te: 'రైడ్ వెతకండి', hi: 'राइड खोजें' },
  post: { en: 'Post Ride', te: 'రైడ్ పోస్ట్', hi: 'राइड पोस्ट' },
  myRides: { en: 'My Rides', te: 'నా రైడ్స్', hi: 'मेरी राइड' },
  profile: { en: 'Profile', te: 'ప్రొఫైల్', hi: 'प्रोफ़ाइल' },
  findRide: { en: 'Find a Ride', te: 'రైడ్ వెతకండి', hi: 'राइड खोजें' },
  offerRide: { en: 'Offer a Ride', te: 'రైడ్ ఆఫర్ చేయండి', hi: 'राइड ऑफ़र करें' },
  hello: { en: 'Hello', te: 'నమస్తే', hi: 'नमस्ते' },
  whereTo: { en: 'Where are you going today?', te: 'ఈరోజు ఎక్కడికి వెళ్తున్నారు?', hi: 'आज आप कहाँ जा रहे हैं?' },
  search: { en: 'Search rides', te: 'రైడ్స్ వెతకండి', hi: 'राइड खोजें' },
  publish: { en: 'Publish ride', te: 'రైడ్ ప్రచురించండి', hi: 'राइड प्रकाशित करें' },
  request: { en: 'Request to book', te: 'బుక్ చేయమని అభ్యర్థించండి', hi: 'बुकिंग का अनुरोध' },
  upcoming: { en: 'Upcoming', te: 'రాబోయేవి', hi: 'आगामी' },
  completed: { en: 'Completed', te: 'పూర్తయినవి', hi: 'पूर्ण' },
  cancelled: { en: 'Cancelled', te: 'రద్దయినవి', hi: 'रद्द' },
  slideStart: { en: 'Slide to start ride', te: 'రైడ్ ప్రారంభించడానికి స్లైడ్ చేయండి', hi: 'राइड शुरू करने के लिए स्लाइड करें' },
  slideEnd: { en: 'Slide to end ride', te: 'రైడ్ ముగించడానికి స్లైడ్ చేయండి', hi: 'राइड समाप्त करने के लिए स्लाइड करें' },
  from: { en: 'Pickup', te: 'పికప్', hi: 'पिकअप' },
  to: { en: 'Destination', te: 'గమ్యం', hi: 'गंतव्य' },
  myRidesSub: { en: 'Bookings & trips', te: 'బుకింగ్స్ & ట్రిప్స్', hi: 'बुकिंग और यात्राएँ' },
  findSub: { en: 'Share a seat, save money', te: 'సీటు పంచుకోండి, డబ్బు ఆదా చేయండి', hi: 'सीट शेयर करें, पैसे बचाएँ' },
  offerSub: { en: 'Fill empty seats', te: 'ఖాళీ సీట్లు నింపండి', hi: 'खाली सीटें भरें' },
};

export function useT() {
  const { state } = useStore();
  return (k) => T[k]?.[state.lang] || T[k]?.en || k;
}
