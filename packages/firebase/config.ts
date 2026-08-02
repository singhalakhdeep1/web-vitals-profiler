// Firebase configuration for web vitals profiler

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export async function saveVitals(vitals: any) {
  const vitalsRef = db.collection('vitals');
  await vitalsRef.add({
    ...vitals,
    timestamp: new Date()
  });
}

export async function getVitalsByUrl(url: string, limit = 100) {
  const vitalsRef = db.collection('vitals');
  const snapshot = await vitalsRef
    .where('url', '==', url)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => doc.data());
}

export async function getVitalsStats(url: string) {
  const vitals = await getVitalsByUrl(url, 1000);
  
  const lcpValues = vitals.map(v => v.lcp).filter(v => v != null);
  const fidValues = vitals.map(v => v.fid).filter(v => v != null);
  const clsValues = vitals.map(v => v.cls).filter(v => v != null);

  return {
    lcp: {
      p50: percentile(lcpValues, 50),
      p75: percentile(lcpValues, 75),
      p95: percentile(lcpValues, 95)
    },
    fid: {
      p50: percentile(fidValues, 50),
      p75: percentile(fidValues, 75),
      p95: percentile(fidValues, 95)
    },
    cls: {
      p50: percentile(clsValues, 50),
      p75: percentile(clsValues, 75),
      p95: percentile(clsValues, 95)
    }
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}
