# Releasing Fathoms

Two phones, sideloaded APKs, one signing key. This is the Phase 5 procedure. Nothing here is automated beyond `pnpm android:release` and `pnpm version:bump`.

## The signing key, once

Android only installs an update over an existing app when both are signed with the same key. Lose the key and the next build is a fresh install under a new signature: the room on the server survives (it lives in Firestore under the anonymous uid, which also survives as long as the app data is not cleared), but the phone has to be set up again. So:

1. Create the keystore somewhere outside the repo, for example `~/keys/fathoms-release.jks`:

   ```bash
   keytool -genkeypair -v \
     -keystore ~/keys/fathoms-release.jks \
     -alias fathoms \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   It asks for a keystore password, a key password, and a name. Use a password manager for both passwords.

2. Tell the build where it is. Either write `android/keystore.properties` (ignored by git):

   ```
   storeFile=/home/you/keys/fathoms-release.jks
   storePassword=...
   keyAlias=fathoms
   keyPassword=...
   ```

   or export `FATHOMS_KEYSTORE_PATH`, `FATHOMS_KEYSTORE_PASSWORD`, `FATHOMS_KEY_ALIAS`, and `FATHOMS_KEY_PASSWORD` in the shell that runs the build.

3. Back the keystore up in two places that are not this computer (the password manager's file attachment and an encrypted drive both work). Write down where, here:

   Keystore backups: ____________________________

   Recovery: restore the `.jks` file to any machine, recreate `keystore.properties` with the same passwords, and `pnpm android:release` signs with the same key again.

## Every release

1. `pnpm lint && pnpm test && pnpm test:rules && pnpm test:e2e` (the last two need Java for the emulators).
2. `pnpm version:bump patch` (or `minor`, `major`, or an exact `x.y.z`). It updates `package.json`, `src/config/app.ts`, and the Android `versionCode` and `versionName`. Android refuses to install a lower `versionCode` over a higher one, so the code only ever goes up.
3. Commit the bump.
4. `pnpm android:release`. It builds the web app, syncs it into `android/`, runs `gradlew assembleRelease`, and copies the signed APK to `release/fathoms-<version>.apk` (the folder is ignored by git). Needs JDK 21 and the Android SDK with platform 36, like the debug build.
5. Deploy the backend when it changed: `cd functions && pnpm deploy` and `pnpm exec firebase deploy --only firestore:rules`.

## Installing on both phones

First time on a phone:

1. Send the APK to the phone (a message to yourself, a cloud drive, or USB).
2. Open it. Android asks to allow installs from that source (Messages, Drive, Files, or the browser). Allow it once for that app; the setting stays.
3. Tap Install. If Play Protect asks, choose Install anyway: the app is not on the Play Store, which is expected.
4. Open Fathoms, allow notifications when asked, and go through the Samsung battery guide in Settings so the phone does not put the app to sleep.

Updates: install the new APK the same way. Android installs it over the old one and keeps the app data: the room, the anonymous sign in, drafts, the app lock. The only hard rule is the same signing key.

Both phones should run the same version. The room document and the rules do not change shape within a version line, and the client validates what it reads, so a short mismatch only shows up as a missing feature on the older phone.

## Crash reporting

Not set up. Firebase Crashlytics would add the plugin and the Gradle changes for a crash feed in the console; for two phones, a screenshot of the error screen and the Android logcat are usually enough. Add it if the app starts crashing in ways you cannot see.

## Version of this document

Written for Capacitor 8, Android Gradle Plugin 8.13, and JDK 21.
