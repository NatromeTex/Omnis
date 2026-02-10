FROM node:20-bullseye

# ---------------- Java ----------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk wget unzip git ca-certificates ccache \
 && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# ---------------- Android SDK ----------------
ENV ANDROID_HOME=/opt/android-sdk
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/build-tools/34.0.0"

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools

RUN wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /tmp/tools.zip \
 && unzip -q /tmp/tools.zip -d ${ANDROID_HOME}/cmdline-tools \
 && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
 && rm /tmp/tools.zip

RUN yes | sdkmanager --licenses
RUN sdkmanager \
    "platform-tools" \
    "build-tools;34.0.0" \
    "platforms;android-34"

# ---------------- Gradle ----------------
ENV GRADLE_USER_HOME=/opt/gradle-cache

# ---------------- ccache ----------------
ENV USE_CCACHE=1
ENV CCACHE_DIR=/root/.ccache
ENV CCACHE_MAXSIZE=20G

# ---------------- App ----------------
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

CMD ["bash"]
