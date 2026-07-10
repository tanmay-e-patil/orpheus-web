# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS build

RUN apk add --no-cache ca-certificates
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
COPY --from=build /src/web /web

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
