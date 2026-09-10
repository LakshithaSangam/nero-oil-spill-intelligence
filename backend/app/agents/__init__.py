"""Multi-agent investigation architecture (Advanced feature 11).

Each agent wraps exactly one pipeline module, emits a typed result plus a
human-readable rationale, and is coordinated by ``orchestrator.py``. Agents are
deterministic in v1 (no LLM dependency); an LLM reasoning layer can be added behind
the same ``Agent`` base class without touching the orchestrator. Wired in milestone M6.

  SatelliteAgent      -> modules.detection
  OceanAgent          -> modules.ocean_intelligence (hindcast + forecast)
  VesselAgent         -> modules.investigation (AIS reconstruction + behaviour)
  InvestigationAgent  -> modules.investigation (scoring + evidence cards)
  EnvironmentalAgent  -> modules.environmental
  ReportAgent         -> services.report_generator
"""
