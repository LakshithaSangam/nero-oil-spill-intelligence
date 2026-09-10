"""Data Provider Layer.

The AI pipeline never imports a concrete provider. It calls ``registry.get(domain, name)``
and receives whichever implementation the current configuration selects. Every domain
ships a ``MockProvider`` so the platform runs end-to-end with no credentials.
"""
