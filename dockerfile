# ------------------------------------------------------------
# Base: Node + Java 17
# ------------------------------------------------------------
FROM node:20-bullseye

# Install Java 17 (required by RN 0.79)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk wget unzip git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# ------------------------------------------------------------
# Android SDK
# ------------------------------------------------------------
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0"

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools

# Android commandline tools
RUN wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/tools.zip \
 && unzip -q /tmp/tools.zip -d ${ANDROID_HOME}/cmdline-tools \
 && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
 && rm /tmp/tools.zip

# Accept licenses + install SDK components
RUN yes | sdkmanager --licenses
RUN sdkmanager \
    "platform-tools" \
    "build-tools;34.0.0" \
    "platforms;android-34"

# ------------------------------------------------------------
# Gradle cache (kept inside a volume by docker-compose)
# ------------------------------------------------------------
ENV GRADLE_USER_HOME=/opt/gradle-cache

# ------------------------------------------------------------
# Project app
# ------------------------------------------------------------
WORKDIR /app

COPY package.json ./
RUN npm install
RUN npm install --save-dev expo @expo/cli

COPY . .

# Default command (can be overridden)
CMD ["bash"]
