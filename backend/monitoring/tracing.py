"""
OpenTelemetry Tracing — distributed tracing for the AcquiSense backend.

Instruments:
  - FastAPI HTTP requests (opentelemetry-instrumentation-fastapi)
  - OpenAI client calls (manual spans)
  - Redis operations (opentelemetry-instrumentation-redis)
  - Pipeline runner steps (manual spans)

Exporters:
  - OTLP gRPC to Jaeger (default: localhost:4317)
  - Fallback: console exporter for local dev

Usage in main.py:
  from monitoring.tracing import setup_tracing
  setup_tracing(app)

Usage in any agent:
  from monitoring.tracing import get_tracer
  tracer = get_tracer("finance_agent")
  with tracer.start_as_current_span("analyze_documents") as span:
      span.set_attribute("deal_id", deal_id)
      span.set_attribute("doc_count", len(docs))
      result = await self.analyze(...)
"""
from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

_SERVICE_NAME  = os.getenv("OTEL_SERVICE_NAME", "acquisense-backend")
_OTLP_ENDPOINT = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
_ENV           = os.getenv("APP_ENV", "development")


def setup_tracing(app: "FastAPI") -> None:
    """
    Initialize OpenTelemetry tracing and instrument the FastAPI app.
    Call once at startup in main.py before any routes are served.
    """
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME, DEPLOYMENT_ENVIRONMENT
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        resource = Resource.create({
            SERVICE_NAME: _SERVICE_NAME,
            DEPLOYMENT_ENVIRONMENT: _ENV,
            "service.version": "4.0.0",
        })

        provider = TracerProvider(resource=resource)

        # Try OTLP exporter (Jaeger / Tempo)
        exporter_ok = False
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            otlp_exporter = OTLPSpanExporter(endpoint=_OTLP_ENDPOINT, insecure=True)
            provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
            logger.info("[Tracing] OTLP exporter configured → %s", _OTLP_ENDPOINT)
            exporter_ok = True
        except Exception as exc:
            logger.warning("[Tracing] OTLP exporter unavailable (%s) — using console exporter", exc)

        # Fallback: console exporter (dev/test only)
        if not exporter_ok or _ENV == "development":
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

        trace.set_tracer_provider(provider)

        # Instrument FastAPI
        FastAPIInstrumentor.instrument_app(app)

        # Instrument Redis (if redis package is installed)
        try:
            from opentelemetry.instrumentation.redis import RedisInstrumentor
            RedisInstrumentor().instrument()
            logger.info("[Tracing] Redis instrumentation enabled")
        except Exception:
            pass   # optional

        logger.info("[Tracing] OpenTelemetry tracing initialized (service=%s)", _SERVICE_NAME)

    except ImportError as exc:
        logger.warning(
            "[Tracing] OpenTelemetry packages not installed — tracing disabled. "
            "Install: pip install opentelemetry-sdk opentelemetry-instrumentation-fastapi "
            "opentelemetry-exporter-otlp-proto-grpc opentelemetry-instrumentation-redis\n"
            "Error: %s", exc
        )


def get_tracer(name: str):
    """
    Return a tracer for a given component name.
    Returns a no-op tracer if OpenTelemetry is not set up.
    """
    try:
        from opentelemetry import trace
        return trace.get_tracer(f"{_SERVICE_NAME}.{name}", schema_url="https://opentelemetry.io/schemas/1.11.0")
    except ImportError:
        return _NoOpTracer()


class _NoOpSpan:
    def set_attribute(self, *a, **kw): pass
    def record_exception(self, *a, **kw): pass
    def set_status(self, *a, **kw): pass
    def __enter__(self): return self
    def __exit__(self, *a): pass


class _NoOpTracer:
    def start_as_current_span(self, name: str, **kw):
        return _NoOpSpan()
    def start_span(self, name: str, **kw):
        return _NoOpSpan()
