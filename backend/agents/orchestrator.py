"""
Orchestrator — launches all 9 domain agents in parallel, tracks progress,
and collects results into a unified job state.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Callable, Awaitable

from openai import AsyncOpenAI

from agents.base_agent import ProgressCallback
from agents.legal_agent import LegalAgent
from agents.finance_agent import FinanceAgent
from agents.commercial_agent import CommercialAgent
from agents.tech_agent import TechAgent
from agents.cyber_agent import CyberAgent
from agents.hr_agent import HRAgent
from agents.tax_agent import TaxAgent
from agents.regulatory_agent import RegulatoryAgent
from agents.esg_agent import ESGAgent
from api.schemas import (
    AgentProgress,
    AgentStatus,
    Domain,
    DomainFindings,
)
from ingestion.chunker import Chunk
from monitoring.metrics import ACTIVE_JOBS, PIPELINE_JOBS_TOTAL

logger = logging.getLogger(__name__)

# Map domain → agent class
AGENT_REGISTRY = {
    Domain.LEGAL: LegalAgent,
    Domain.FINANCE: FinanceAgent,
    Domain.COMMERCIAL: CommercialAgent,
    Domain.TECH: TechAgent,
    Domain.CYBER: CyberAgent,
    Domain.HR: HRAgent,
    Domain.TAX: TaxAgent,
    Domain.REGULATORY: RegulatoryAgent,
    Domain.ESG: ESGAgent,
}

# Model profiles
MODEL_PROFILES = {
    "economy": {"domain": "gpt-4o-mini", "synthesis": "gpt-4o-mini"},
    "standard": {"domain": "gpt-4o-mini", "synthesis": "gpt-4o"},
    "premium":  {"domain": "gpt-4o",     "synthesis": "gpt-4o"},
}


class Orchestrator:
    """
    Runs all 9 domain agents in parallel using asyncio.gather().
    Calls the progress_cb on every agent status update so the Node gateway
    can relay events to the React frontend via WebSocket.
    """

    def __init__(self, openai_api_key: str, model_profile: str = "standard"):
        profile = MODEL_PROFILES.get(model_profile, MODEL_PROFILES["standard"])
        self.client = AsyncOpenAI(api_key=openai_api_key)
        self.domain_model = profile["domain"]
        self.synthesis_model = profile["synthesis"]

    async def run_all_agents(
        self,
        chunks: list[Chunk],
        job_id: str,
        deal_context: str = "",
        progress_cb: ProgressCallback | None = None,
    ) -> dict[Domain, DomainFindings]:
        """
        Launch all 9 domain agents concurrently.
        Returns dict[Domain → DomainFindings].
        """
        ACTIVE_JOBS.inc()
        PIPELINE_JOBS_TOTAL.labels(status="analyzing").inc()

        try:
            tasks = []
            for domain, AgentClass in AGENT_REGISTRY.items():
                agent = AgentClass(client=self.client, model=self.domain_model)

                async def _run(a=agent, d=domain):
                    # Wrap the progress callback to tag it with domain
                    async def domain_cb(p: AgentProgress) -> None:
                        if progress_cb:
                            await progress_cb(p)

                    try:
                        result = await a.analyze(
                            chunks=chunks,
                            job_id=job_id,
                            deal_context=deal_context,
                            progress_cb=domain_cb,
                        )
                        return (d, result)
                    except Exception as exc:
                        logger.error("[%s] Agent crashed: %s", d.value, exc)
                        # Return empty findings so we don't lose other domains
                        if progress_cb:
                            await progress_cb(AgentProgress(
                                domain=d,
                                status=AgentStatus.FAILED,
                                pct=0,
                                findings_count=0,
                                error=str(exc),
                            ))
                        return (d, DomainFindings(domain=d, summary=f"Agent failed: {exc}"))

                tasks.append(_run())

            results = await asyncio.gather(*tasks, return_exceptions=False)

            return {domain: findings for domain, findings in results}

        finally:
            ACTIVE_JOBS.dec()
