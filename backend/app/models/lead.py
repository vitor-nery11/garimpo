import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


class Lead(Base):
    __tablename__ = 'leads'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    niche: Mapped[str] = mapped_column(String(120), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), nullable=False, default='')
    phone: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    instagram_handle: Mapped[str | None] = mapped_column(String(120), nullable=True)
    diagnostic: Mapped[str] = mapped_column(String(32), nullable=False, default='sem_site')
    stage: Mapped[str] = mapped_column(String(32), nullable=False, default='na_fila', index=True)
    ai_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    handoff_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    reviews_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    messages: Mapped[list['Message']] = relationship(
        'Message',
        back_populates='lead',
        cascade='all, delete-orphan',
        order_by='Message.created_at.asc()',
    )


class Message(Base):
    __tablename__ = 'messages'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    lead_id: Mapped[str] = mapped_column(
        String(36), ForeignKey('leads.id', ondelete='CASCADE'), nullable=False, index=True
    )
    sender: Mapped[str] = mapped_column(String(16), nullable=False)  # 'lead' | 'ai' | 'user'
    text: Mapped[str] = mapped_column(Text, nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    lead: Mapped['Lead'] = relationship('Lead', back_populates='messages')


class BrainSettings(Base):
    __tablename__ = 'brain_settings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    persona_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    problem_solved: Mapped[str] = mapped_column(Text, nullable=False)
    common_objections: Mapped[str] = mapped_column(Text, nullable=False)
    handoff_triggers: Mapped[str] = mapped_column(Text, nullable=False)
    templates: Mapped[list[dict[str, str]]] = mapped_column(JSON, nullable=False, default=list)
    allowed_start_time: Mapped[str] = mapped_column(String(10), nullable=False, default='08:30')
    allowed_end_time: Mapped[str] = mapped_column(String(10), nullable=False, default='18:00')
    max_daily_messages: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    min_interval_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_interval_sec: Mapped[int] = mapped_column(Integer, nullable=False, default=240)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


class ConnectionSettings(Base):
    __tablename__ = 'connection_settings'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    alert_phone: Mapped[str] = mapped_column(String(32), nullable=False, default='')
    search_provider: Mapped[str] = mapped_column(String(32), nullable=False, default='google_places')
    search_api_key: Mapped[str] = mapped_column(String(255), nullable=False, default='')
    ai_provider: Mapped[str] = mapped_column(String(32), nullable=False, default='openai')
    ai_api_key: Mapped[str] = mapped_column(String(255), nullable=False, default='')
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
