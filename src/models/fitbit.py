from sqlalchemy import Column, Integer, String, ForeignKey, Date, DateTime, Float, JSON
from sqlalchemy.sql import func
from .orm import Base

class FitbitToken(Base):
    __tablename__ = 'fitbit_tokens'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('user_settings.id'), nullable=False)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    expires_at = Column(Integer, nullable=False)
    scope = Column(String, nullable=False)


class FitbitDailyMetrics(Base):
    __tablename__ = 'fitbit_daily_metrics'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('user_settings.id'), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    sleep_duration_hours = Column(Float, nullable=True)
    sleep_efficiency = Column(Float, nullable=True)
    resting_heart_rate = Column(Float, nullable=True)
    readiness_score = Column(Float, nullable=True)
    summary = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
