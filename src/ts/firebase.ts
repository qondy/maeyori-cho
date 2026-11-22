import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyA4664xhJdd_A3d2ZE-gbV2Cfq2fOIY94g',
  authDomain: 'maeyori-cho.firebaseapp.com',
  projectId: 'maeyori-cho',
  storageBucket: 'maeyori-cho.firebasestorage.app',
  messagingSenderId: '838109666157',
  appId: '1:838109666157:web:dcee431e44c4247461d864',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
