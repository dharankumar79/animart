# Firebase setup for this project

This app currently uses the local Express + SQLite backend for accounts and pet listings.
To move mobile verification to Firebase SMS with reCAPTCHA:

1. Create a Firebase project at https://console.firebase.google.com.
2. Add a Web app in Firebase project settings.
3. Copy the Firebase config object for the Web app.
4. In Firebase Authentication, enable the Phone sign-in provider.
5. Add your app domain in Authentication settings. Use a deployed domain for real phone auth; Firebase notes that localhost is not allowed as a hosted domain for phone auth.
6. Install Firebase in the frontend:

```powershell
cd frontend/user-app
npm install firebase
```

7. Add a Firebase client file in the frontend source when you move the marketplace from the static `public/index.html` page into React:

```js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

8. Replace the local development SMS endpoints with Firebase `RecaptchaVerifier` and `signInWithPhoneNumber`.
9. Send the Firebase ID token to the backend and verify it there with the Firebase Admin SDK before creating listings or accounts.

For now, the app has a local SMS-code development flow so you can test the login and listing experience without a Firebase project yet.
