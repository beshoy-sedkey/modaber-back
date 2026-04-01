FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

# Copy package files and install base dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy all source code
COPY . .

EXPOSE 3000

# Hot-reload development server
CMD ["npx", "nest", "start", "--watch"]
