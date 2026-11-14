# syntax=docker/dockerfile:1

FROM node:24.22.1-alpine3.24 AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.27.4-alpine3.24 AS build

RUN apk add --no-cache --upgrade "ca-certificates>=20261020-r0" \
    && update-ca-certificates \
    && test -s /etc/ssl/certs/ca-certificates.crt
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build \
      -trimpath \
      -ldflags="-s -w -buildid=" \
      -o /out/orpheus \
      ./cmd/orpheus

FROM scratch

ARG APP_VERSION=unknown
LABEL observability.service="orpheus-web" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /out/orpheus /orpheus
COPY --from=frontend /src/web /web

ENV APP_ENV=production \
    APP_VERSION=${APP_VERSION} \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://alloy:4318 \
    OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
    OTEL_TRACES_SAMPLER_ARG=1 \
    PORT=8080

WORKDIR /
EXPOSE 8080
USER 65532:65532

ENTRYPOINT ["/orpheus"]
