FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY tests ./tests
RUN node --test tests/azls-registered-docent-specialties.test.js
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
