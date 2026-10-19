// All UI copy, Hindi first. Plain words, sentence case, no em-dashes.
export const strings = {
  appName: { hi: 'मेडीसाथी', en: 'MediSaathi' },
  navToday: { hi: 'आज', en: 'Today' },
  navPatients: { hi: 'मरीज़', en: 'Patients' },
  navScan: { hi: 'रिपोर्ट', en: 'Reports' },
  navGuidance: { hi: 'सलाह', en: 'Guidance' },
  navDonors: { hi: 'रक्तदाता', en: 'Donors' },
  navSync: { hi: 'सिंक', en: 'Sync' },
  greeting: { hi: 'नमस्ते, {name}', en: 'Namaste, {name}' },
  todayFollowUps: { hi: 'आज के फॉलो-अप', en: 'Follow-ups for today' },
  noFollowUps: { hi: 'आज कोई फॉलो-अप नहीं है।', en: 'No follow-ups today.' },
  quickActions: { hi: 'जल्दी करें', en: 'Quick actions' },
  addPatient: { hi: 'नया मरीज़ जोड़ें', en: 'Add patient' },
  scanReport: { hi: 'रिपोर्ट समझें', en: 'Explain a report' },
  findDonor: { hi: 'रक्तदाता खोजें', en: 'Find a donor' },
  emergency: { hi: 'आपातकाल', en: 'Emergency' },
  offline: { hi: 'आप ऑफ़लाइन हैं। सब कुछ इस फ़ोन पर सेव हो रहा है।', en: 'You are offline. Everything is saved on this device.' },
  storageNotPersistent: {
    hi: 'यह ब्राउज़र सेव डेटा मिटा सकता है। बाकी रिकॉर्ड जल्दी सिंक करें।',
    en: 'This browser may clear saved data. Sync pending records soon.',
  },
  storageInMemory: {
    hi: 'यह ब्राउज़र डेटा सेव नहीं कर सकता। पेज बंद करने पर डेटा मिट जाएगा।',
    en: 'This browser cannot save data. Closing the page will erase it.',
  },
  pendingCount: { hi: '{n} रिकॉर्ड सिंक होने बाकी', en: '{n} records waiting to sync' },
  language: { hi: 'English', en: 'हिंदी' },
  loading: { hi: 'खुल रहा है…', en: 'Opening…' },
  loadError: { hi: 'ऐप शुरू नहीं हो सका। पेज दोबारा खोलें।', en: 'The app could not start. Reload the page.' },
  comingSoon: { hi: 'यह हिस्सा जल्द आएगा।', en: 'This section is coming next.' },
} satisfies Record<string, { hi: string; en: string }>

export type StringKey = keyof typeof strings
