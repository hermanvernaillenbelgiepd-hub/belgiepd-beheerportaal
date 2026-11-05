FROM node:22-slim
# Private in-portal slides/document viewer: server-side Office → PDF, no public URLs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-impress libreoffice-writer libreoffice-calc fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY tests ./tests
COPY Dockerfile ./Dockerfile
# Identity transfers modify dossier ownership: release only after policy checks pass.
RUN node --test tests/dc-id-transfer.test.js tests/basic-observations.test.js tests/document-center.test.js tests/document-folders-links.test.js tests/activity-roster-order.test.js tests/officer-notifications.test.js tests/personal-notification-receipts.test.js tests/staff-activity-followup.test.js tests/auto-police-basic-access.test.js tests/multiservice-home-observations.test.js tests/basic-observation-target-selection.test.js tests/basic-observation-json-parser.test.js tests/basic-observation-archive.test.js tests/basic-observation-auto-archive.test.js tests/technical-center.test.js tests/technical-service-editors.test.js tests/azls-registered-docent-specialties.test.js tests/multiservice-profile-rank-visual.test.js tests/library-reuse-visual-artwork.test.js tests/service-profile-brandweer-parity.test.js
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
