FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm install
COPY apps/worker apps/worker
RUN npm run build -w apps/worker
CMD ["node","apps/worker/dist/main.js"]