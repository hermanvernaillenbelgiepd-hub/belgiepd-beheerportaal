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
RUN node --test tests/dc-id-transfer.test.js tests/basic-observations.test.js tests/document-center.test.js tests/document-folders-links.test.js tests/activity-roster-order.test.js tests/officer-notifications.test.js tests/personal-notification-receipts.test.js tests/staff-activity-followup.test.js tests/auto-police-basic-access.test.js tests/multiservice-home-observations.test.js tests/basic-observation-target-selection.test.js tests/basic-observation-json-parser.test.js tests/basic-observation-archive.test.js tests/basic-observation-auto-archive.test.js tests/technical-center.test.js tests/technical-service-editors.test.js tests/azls-registered-docent-specialties.test.js tests/multiservice-profile-rank-visual.test.js tests/library-reuse-visual-artwork.test.js tests/service-profile-brandweer-parity.test.js tests/burger-uniform-grades.test.js tests/service-profile-grade-plate.test.js tests/azls-custom-specialty-visuals.test.js tests/citizen-role-reverification.test.js tests/personnel-specialty-level-privacy.test.js tests/ambulance-uniform-grade-options.test.js tests/weekrapporten-navigation-cleanup.test.js tests/police-call-proposals.test.js tests/personnel-create.test.js tests/police-series-assignment.test.js tests/police-fixed-status.test.js tests/depannage-awv-uniform-parity.test.js tests/burger-organogram-projection.test.js tests/depannage-organogram-overlap.test.js tests/roster-column-library.test.js tests/person-specialty-artwork.test.js tests/manual-burgerraad-recovery.test.js tests/manual-role-service-catalog.test.js tests/manual-role-technical-approval.test.js tests/checkride-policy.test.js tests/citizen-dossier-policy.test.js tests/user-access.test.js tests/discord-role-diagnostics.test.js tests/personnel-grouping-policy.test.js tests/personnel-group-settings.test.js tests/personnel-compact-ui.test.js \
 tests/personnel-first-paint-optimization.test.js \
 tests/dossier-observation-training-instructor.test.js \
 tests/historical-observation-import.test.js tests/leave-reason-migration.test.js \
 tests/honorable-inp-reentry.test.js \
 tests/technical-access-simulator.test.js \
 tests/rollout-final-access-matrix.test.js \
 tests/rollout-honorable-and-commendations.test.js \
 tests/personnel-lifecycle.test.js \
 tests/personnel-decoration-policy.test.js \
 tests/training-requests-fortnight-reports.test.js && npm run check
RUN node --test tests/dossier-weekrapport-endcontrole.test.js
RUN node --test tests/leave-report-projection.test.js
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
