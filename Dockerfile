# syntax=docker/dockerfile:1
FROM node:16-alpine
WORKDIR /code
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]
