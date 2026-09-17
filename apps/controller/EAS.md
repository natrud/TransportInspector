# EAS Build / Submit / OTA — Transport Inspector

## One-time setup

```bash
npm install -g eas-cli
cd /Users/well/Downloads/TransportInspector

# 1. Login under Expo account that owns the project
eas login

# 2. Link project (creates EAS project, fills extra.eas.projectId та updates.url)
eas init

# 3. Bind credentials (interactive)
#    iOS: distribution + push cert
#    Android: keystore (auto-generated unless you upload existing)
eas credentials
```

Replace these placeholders after `eas init`:
- `app.json` → додасться `expo.updates.url` (generated `https://u.expo.dev/<projectId>`)
- `app.json` → додасться `expo.extra.eas.projectId`
- `eas.json` → `submit.production.ios.appleId` / `ascAppId` / `appleTeamId`
- `eas.json` → `submit.production.android.serviceAccountKeyPath` (path до Google Play API key)

## Build profiles

| Profile       | Distribution | Channel       | iOS                    | Android         |
|---------------|--------------|---------------|------------------------|-----------------|
| `development` | internal     | development   | simulator + dev client | APK (debug)     |
| `staging`     | internal     | staging       | device (.ipa)          | APK             |
| `production`  | store        | production    | device (.ipa)          | AAB (Play Store)|

```bash
eas build --profile development --platform android
eas build --profile staging --platform all
eas build --profile production --platform all
```

## OTA updates

```bash
eas update --channel staging --message "..."
eas update --channel production --message "..."
```

## Submit

```bash
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

## Env vars

`API_BASE_URL` / `OIDC_AUTHORITY` зараз — `TODO_*` placeholders у `eas.json`.
Замініть на реальні URL нового бекенда перед першим білдом.

Якщо потрібен secret (API_KEY тощо) — `eas secret:create --name MY_SECRET`
і ref'іть у `eas.json` як `"MY_SECRET": "$MY_SECRET"`.
