FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

# Copy package files and install base dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy prisma schema
COPY prisma ./prisma/

# Copy all source code
COPY . .

# Copy and set up entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

# Generate Prisma client at startup, then run hot-reload dev server
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["npx", "nest", "start", "--watch"]
