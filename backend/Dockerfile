FROM node:20-bookworm-slim

# arduino-cli's official installer needs curl + certs for HTTPS downloads.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install arduino-cli to a fixed location and put it on PATH. Debian (glibc)
# rather than Alpine deliberately -- the AVR toolchain arduino-cli downloads
# below is a prebuilt glibc binary and won't run correctly under Alpine's
# musl libc.
ENV ARDUINO_CLI_PATH=/usr/local/arduino-cli-bin/arduino-cli
RUN mkdir -p /usr/local/arduino-cli-bin \
    && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh \
       | BINDIR=/usr/local/arduino-cli-bin sh
ENV PATH="/usr/local/arduino-cli-bin:${PATH}"

# Pre-install the AVR core (arduino:avr:uno target -- bundles the Servo
# library, no separate install needed) and the IRremote library at build
# time. Baked into the image so a running container never needs network
# access to Arduino's package index, and so the first compile a kid runs
# isn't slowed down by a cold download -- see docs/robotics-camp-block-ide-spec.md
# section 4 for why these two specifically.
RUN arduino-cli config init \
    && arduino-cli core update-index \
    && arduino-cli core install arduino:avr \
    && arduino-cli lib update-index \
    && arduino-cli lib install "IRremote"

WORKDIR /app

# Node deps in their own layer, copied before the rest of the source, so
# this (slow, network-dependent) step only reruns when package.json
# actually changes -- not on every source edit.
COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
# Matches the PORT env var set on the Render service (see deploy
# instructions) -- the app itself reads process.env.PORT with its own
# fallback (src/index.js), this is just documentation of the port this
# image expects to be told to use.
EXPOSE 3001

CMD ["node", "src/index.js"]
