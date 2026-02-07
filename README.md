# Omnis (0.9.0-alpha)

[![My Skills](https://skillicons.dev/icons?i=ts,react)](https://skillicons.dev) <br>

This is an End-to-end encrypted chat app built with Expo + React Native. This repo contains the mobile client, local storage, and crypto utilities.

## Features

- End-to-end encryption (AES-GCM + ECDH P-384)
- Local message storage (SQLite)
- Session management

## Requirements

- Node.js 20+
- Docker (for containerized Android builds)

## Quick start (dev)

```bash
npm install
npx expo start
```

## Android release build (local)

We build Android inside Docker and ignore the generated android/ folder in git.

```bash
docker compose build
docker compose up -d android
docker compose exec android npx expo prebuild --platform android --non-interactive
docker compose exec android npm install
docker compose exec android bash -c "cd android && ./gradlew assembleRelease"
```

APK output:

android/app/build/outputs/apk/release/

## CI/CD (GitHub Actions)

The workflow builds the APK on every push to main (or manual run) and uploads it as an artifact.

- Workflow: [.github/workflows/android-apk.yml](.github/workflows/android-apk.yml)

## Configuration

- API base URL: Settings → Backend URL
- App version constant: [engine/constants.ts](engine/constants.ts)

## Security notes
- Tokens are stored via SecureStore on device.

## Repo structure

- engine/: app code
- app/: Expo Router entry
- docker-compose.yml: container build for Android
- .github/workflows/: CI pipeline

## License
Proprietary (internal/beta)
