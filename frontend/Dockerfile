# Milestone 2 "Docker": production-oriented multi-stage build for the static
# frontend - build with Node, serve the built assets with nginx (no Node
# runtime needed in the final image). VITE_API_BASE_URL is baked in at BUILD
# time (Vite inlines env vars into the bundle) - pass it as a build arg
# pointing at the deployed backend's public URL, see docs/DEPLOYMENT.md.
#
# NOTE: prepared but not verified with `docker build` in the development
# sandbox this was written in (no Docker daemon access there) - see
# docs/DEPLOYMENT.md "Known limitations" before relying on it unverified.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:3000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
