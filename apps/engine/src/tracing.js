// @ts-check
import { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Layer } from "effect";

/**
 * Every use case already runs inside `Effect.withSpan`; this Layer decides where spans go.
 * Without an endpoint it is empty, so local runs pay nothing. Duplicated from the harness on
 * purpose: no shared package (ADR-0037).
 * @param {string | undefined} endpoint OTLP/HTTP collector URL
 * @param {string} serviceName
 */
export const TracingLive = (endpoint, serviceName) =>
  endpoint === undefined
    ? Layer.empty
    : NodeSdk.layer(() => ({
        resource: { serviceName },
        spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint })),
      }));
