"""AI pipeline stages.

Each module exposes a ``service.py`` entrypoint, keeps its helpers private, and speaks
to the rest of the system only through ``app.schemas``. A module may be replaced
wholesale as long as its declared input/output contract holds.

  detection/            Module 1  — spill detection & characterisation      (M2)
  ocean_intelligence/   Module 2  — hindcast origin + forecast drift        (M3)
  investigation/        Module 3  — AIS reconstruction + suspect ranking    (M4)
  environmental/        Adv. 7    — environmental impact intelligence       (M7+)
  cause_classification/ Adv. 4    — most-likely spill cause                 (M7+)
  risk_index/           Adv. 5+6  — micro-leak warning + pollution risk     (M7+)
  similarity/           Adv. 9    — spill similarity vs NOAA incidents      (M7+)
  knowledge_graph/      Adv. 10   — ship↔company↔cargo↔origin↔evidence graph (M7+)
"""
