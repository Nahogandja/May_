MAY — Full mobile visual refresh (NAVY / PINK / PURPLE)
=========================================================

Source baseline:
- Uploaded may-mobile (2).zip (mobile Oct 16, 2026)
- MAY Academic Demo Revision 01 (Sharing/Solo) mobile files
- Revision 02 (SOS/IRT) mobile files
- Revision 03 (demo Wallet) mobile files
- The already-approved MAY welcome replacement

IMPORTANT: This is a SOURCE-BASED PATCH, NOT A LIVE SYNC from your Windows laptop.
If you made local edits beyond those versions, back them up and compare before replacing.
The separate may-admin web dashboard and backend are NOT modified.

1) In Windows, BACK UP or commit current may-mobile first:
   cd "C:\Users\Glucose Nahogandja\MayAppDev\may-mobile"
   git status
   git add .
   git commit -m "Backup before MAY full UI redesign"

2) Extract this ZIP. The optional INSTALL_ON_WINDOWS.ps1 script backs up
   every overwritten file outside may-mobile, then applies all files in one run.
   From the extracted folder, run:
   powershell -NoProfile -ExecutionPolicy Bypass -File .\INSTALL_ON_WINDOWS.ps1 -ProjectPath "C:\Users\Glucose Nahogandja\MayAppDev\may-mobile"

   Alternatively copy the ZIP's app, components, theme and tailwind.config.js
   directly into may-mobile, MERGING folders. Never delete existing folders.

3) Validate with:
   npx tsc --noEmit
   npx expo start --dev-client -c

4) On phone, test login, sign up with the keyboard visible, location search,
   booking Sharing and Solo, driver selection, Wallet, Safe Arrival, SOS,
   profile and driver approval/availability. Confirm all behaviors before OTA.

5) Publish compatible JavaScript/UI changes ONLY after testing:
   eas update --channel preview --platform android --environment preview --message "MAY full UI redesign"

No new dependencies or native settings were intentionally added.
Your existing approved welcome screen is preserved and is NOT in this ZIP.

Files changed / new:
  app/(auth)/sign-in.tsx
  app/(auth)/sign-up.tsx
  app/(root)/(tabs)/_layout.tsx
  app/(root)/(tabs)/chat.tsx
  app/(root)/(tabs)/home.tsx
  app/(root)/(tabs)/profile.tsx
  app/(root)/(tabs)/rides.tsx
  app/(root)/book-ride.tsx
  app/(root)/confirm-ride.tsx
  app/(root)/driver.tsx
  app/(root)/find-ride.tsx
  app/(root)/wallet.tsx
  app/admin.tsx
  components/CustomButton.tsx
  components/DriverCard.tsx
  components/InputField.tsx
  components/LocationTextInput.tsx
  components/Map.tsx
  components/MayAuthShell.tsx
  components/MayHeader.tsx
  components/RideCard.tsx
  components/RideLayout.tsx
  tailwind.config.js
  theme/may.ts
