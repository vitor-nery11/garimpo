from pydantic import BaseModel, Field

from app.schemas.lead import SiteDiagnostic


class ProspectingSearchRequest(BaseModel):
    city: str = Field(..., min_length=2, max_length=120)
    niche: str = Field(..., min_length=2, max_length=120)
    limit: int = Field(default=15, ge=1, le=60)


class ProspectingCandidateOut(BaseModel):
    id: str
    company_name: str
    niche: str
    city: str
    neighborhood: str
    phone: str
    website_url: str | None = None
    instagram_handle: str | None = None
    diagnostic: SiteDiagnostic
    rating: float | None = None
    reviews_count: int | None = None
    has_whatsapp: bool = True
    already_queued: bool = False


class BatchQueueCandidate(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    niche: str = Field(..., min_length=1, max_length=120)
    city: str = Field(..., min_length=1, max_length=120)
    neighborhood: str = Field(default='', max_length=120)
    phone: str = Field(..., min_length=8, max_length=32)
    website_url: str | None = None
    instagram_handle: str | None = None
    diagnostic: SiteDiagnostic
    rating: float | None = None
    reviews_count: int | None = None


class BatchQueueRequest(BaseModel):
    candidates: list[BatchQueueCandidate] = Field(..., min_length=1)


class BatchQueueResponse(BaseModel):
    enqueued_count: int
    skipped_duplicates: int
    lead_ids: list[str]
