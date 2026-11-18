"""initial schema for leads, messages, brain_settings and connection_settings

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-18 18:37:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'leads',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('company_name', sa.String(length=255), nullable=False),
        sa.Column('niche', sa.String(length=120), nullable=False),
        sa.Column('city', sa.String(length=120), nullable=False),
        sa.Column('neighborhood', sa.String(length=120), nullable=False, server_default=''),
        sa.Column('phone', sa.String(length=32), nullable=False),
        sa.Column('website_url', sa.String(length=500), nullable=True),
        sa.Column('instagram_handle', sa.String(length=120), nullable=True),
        sa.Column('diagnostic', sa.String(length=32), nullable=False, server_default='sem_site'),
        sa.Column('stage', sa.String(length=32), nullable=False, server_default='na_fila'),
        sa.Column('ai_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('handoff_summary', sa.Text(), nullable=True),
        sa.Column('rating', sa.Float(), nullable=True),
        sa.Column('reviews_count', sa.Integer(), nullable=True),
        sa.Column('last_message_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_leads_company_name', 'leads', ['company_name'])
    op.create_index('ix_leads_phone', 'leads', ['phone'], unique=True)
    op.create_index('ix_leads_stage', 'leads', ['stage'])

    op.create_table(
        'messages',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('lead_id', sa.String(length=36), sa.ForeignKey('leads.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender', sa.String(length=16), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('external_id', sa.String(length=120), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_messages_lead_id', 'messages', ['lead_id'])
    op.create_index('ix_messages_external_id', 'messages', ['external_id'])

    op.create_table(
        'brain_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('persona_prompt', sa.Text(), nullable=False),
        sa.Column('problem_solved', sa.Text(), nullable=False),
        sa.Column('common_objections', sa.Text(), nullable=False),
        sa.Column('handoff_triggers', sa.Text(), nullable=False),
        sa.Column('templates', sa.JSON(), nullable=False),
        sa.Column('allowed_start_time', sa.String(length=10), nullable=False),
        sa.Column('allowed_end_time', sa.String(length=10), nullable=False),
        sa.Column('max_daily_messages', sa.Integer(), nullable=False),
        sa.Column('min_interval_sec', sa.Integer(), nullable=False),
        sa.Column('max_interval_sec', sa.Integer(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        'connection_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('alert_phone', sa.String(length=32), nullable=False),
        sa.Column('search_provider', sa.String(length=32), nullable=False),
        sa.Column('search_api_key', sa.String(length=255), nullable=False),
        sa.Column('ai_provider', sa.String(length=32), nullable=False),
        sa.Column('ai_api_key', sa.String(length=255), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('connection_settings')
    op.drop_table('brain_settings')
    op.drop_index('ix_messages_external_id', table_name='messages')
    op.drop_index('ix_messages_lead_id', table_name='messages')
    op.drop_table('messages')
    op.drop_index('ix_leads_stage', table_name='leads')
    op.drop_index('ix_leads_phone', table_name='leads')
    op.drop_index('ix_leads_company_name', table_name='leads')
    op.drop_table('leads')
