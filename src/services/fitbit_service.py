import requests
import os
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any
from src.models.fitbit import FitbitToken, FitbitDailyMetrics
from src.database.orm import SessionLocal

class FitbitService:
    """Service for interacting with the Fitbit API."""
    BASE_URL = "https://api.fitbit.com"

    def __init__(self, token: FitbitToken):
        self.access_token = token.access_token
        self.refresh_token = token.refresh_token
        self.expires_at = token.expires_at
        self.user_id = token.user_id

    def _is_token_expired(self) -> bool:
        """Check if the current access token has expired."""
        return datetime.utcnow().timestamp() > self.expires_at

    def _refresh_token(self) -> None:
        """Refresh the access token using the refresh token."""
        # Update token in database
        db = SessionLocal()
        try:
            # 1. Fetch user settings to get credentials
            from src.models.orm import UserSettings
            # We need to find the user_settings ID. Since self.user_id is user_settings.id (foreign key)
            user_settings = db.query(UserSettings).filter(UserSettings.id == self.user_id).first()
            
            if not user_settings:
                raise Exception(f"User settings not found for ID {self.user_id}")
            
            client_id = user_settings.fitbit_client_id or os.getenv('FITBIT_CLIENT_ID')
            client_secret = user_settings.fitbit_client_secret or os.getenv('FITBIT_CLIENT_SECRET')

            if not client_id or not client_secret:
                raise Exception("Fitbit Client ID or Secret missing for refresh")

            data = {
                'grant_type': 'refresh_token',
                'refresh_token': self.refresh_token
            }
            auth = (client_id, client_secret)
            response = requests.post('https://api.fitbit.com/oauth2/token', data=data, auth=auth)
            
            if response.status_code != 200:
                raise Exception(f"Failed to refresh Fitbit token: {response.text}")
            
            new_tokens = response.json()
            
            token = db.query(FitbitToken).filter(FitbitToken.user_id == self.user_id).first()
            if token:
                token.access_token = new_tokens['access_token']
                token.refresh_token = new_tokens['refresh_token']
                token.expires_at = int(datetime.utcnow().timestamp() + new_tokens['expires_in'])
                db.commit()
                
                # Update instance variables
                self.access_token = new_tokens['access_token']
                self.refresh_token = new_tokens['refresh_token']
                self.expires_at = token.expires_at
        finally:
            db.close()

    def get_sleep_data(self, date: str) -> dict:
        """
        Fetch sleep data for a specific date.
        
        Args:
            date: Date in YYYY-MM-DD format
            
        Returns:
            dict: Sleep data from Fitbit API
        """
        if self._is_token_expired():
            self._refresh_token()
        
        headers = {'Authorization': f'Bearer {self.access_token}'}
        response = requests.get(f"{self.BASE_URL}/1.2/user/-/sleep/date/{date}.json", headers=headers)
        
        # Handle token expiration mid-request
        if response.status_code == 401:
            self._refresh_token()
            headers = {'Authorization': f'Bearer {self.access_token}'}
            response = requests.get(f"{self.BASE_URL}/1.2/user/-/sleep/date/{date}.json", headers=headers)
        
        return response.json()

    def get_daily_metrics(self, target_date: str) -> Dict[str, Any]:
        """
        Return normalized daily metrics for a given date (YYYY-MM-DD).
        """
        sleep = self.get_sleep_data(target_date)
        sleep_list = sleep.get('sleep', [])
        sleep_duration = None
        sleep_efficiency = None
        sleep_start = None
        sleep_end = None
        if sleep_list:
            main_sleep = sleep_list[0]
            sleep_duration = main_sleep.get('duration', 0) / 3600000
            sleep_efficiency = main_sleep.get('efficiency', None)
            sleep_start = main_sleep.get('startTime')
            sleep_end = main_sleep.get('endTime')

        hr = self.get_heart_rate_data(target_date)
        hr_list = hr.get('activities-heart', [])
        resting_hr = None
        if hr_list:
            resting_hr = hr_list[0].get('value', {}).get('restingHeartRate', None)

        return {
            "date": target_date,
            "sleep_duration_hours": sleep_duration,
            "sleep_efficiency": sleep_efficiency,
            "resting_heart_rate": resting_hr,
            "sleep_start": sleep_start,
            "sleep_end": sleep_end
        }

    def compute_readiness(self, metrics: Dict[str, Any]) -> Optional[float]:
        """
        Compute readiness score (0-100) using sleep duration, efficiency, and resting HR.
        """
        sleep_hours = metrics.get("sleep_duration_hours")
        efficiency = metrics.get("sleep_efficiency")
        resting_hr = metrics.get("resting_heart_rate")

        if sleep_hours is None and efficiency is None and resting_hr is None:
            return None

        # Normalize sleep hours (target 7.5h)
        sleep_score = None
        if sleep_hours is not None:
            sleep_score = max(0.0, min(100.0, (sleep_hours / 7.5) * 100.0))

        # Normalize efficiency (target 85%)
        efficiency_score = None
        if efficiency is not None:
            efficiency_score = max(0.0, min(100.0, (efficiency / 85.0) * 100.0))

        # Normalize resting HR (lower is better, assume 50-80 bpm range)
        hr_score = None
        if resting_hr is not None:
            hr_score = max(0.0, min(100.0, (1 - ((resting_hr - 50) / 30)) * 100.0))

        scores = [s for s in [sleep_score, efficiency_score, hr_score] if s is not None]
        if not scores:
            return None
        return round(sum(scores) / len(scores), 1)

    def upsert_daily_metrics(self, db, target_date: date, metrics: Dict[str, Any]) -> FitbitDailyMetrics:
        record = db.query(FitbitDailyMetrics).filter(
            FitbitDailyMetrics.user_id == self.user_id,
            FitbitDailyMetrics.date == target_date
        ).first()

        readiness = self.compute_readiness(metrics)
        if not record:
            record = FitbitDailyMetrics(
                user_id=self.user_id,
                date=target_date,
                sleep_duration_hours=metrics.get("sleep_duration_hours"),
                sleep_efficiency=metrics.get("sleep_efficiency"),
                resting_heart_rate=metrics.get("resting_heart_rate"),
                readiness_score=readiness,
                summary=metrics
            )
            db.add(record)
        else:
            record.sleep_duration_hours = metrics.get("sleep_duration_hours")
            record.sleep_efficiency = metrics.get("sleep_efficiency")
            record.resting_heart_rate = metrics.get("resting_heart_rate")
            record.readiness_score = readiness
            record.summary = metrics
        db.commit()
        db.refresh(record)
        return record

    def prune_old_metrics(self, db, keep_days: int = 90) -> None:
        cutoff = date.today() - timedelta(days=keep_days)
        db.query(FitbitDailyMetrics).filter(
            FitbitDailyMetrics.user_id == self.user_id,
            FitbitDailyMetrics.date < cutoff
        ).delete()
        db.commit()

    def get_or_refresh_daily_summary(self, db, target_date: date, force_refresh: bool = False) -> Optional[FitbitDailyMetrics]:
        record = db.query(FitbitDailyMetrics).filter(
            FitbitDailyMetrics.user_id == self.user_id,
            FitbitDailyMetrics.date == target_date
        ).first()

        if record and not force_refresh:
            return record

        metrics = self.get_daily_metrics(target_date.strftime("%Y-%m-%d"))
        record = self.upsert_daily_metrics(db, target_date, metrics)
        self.prune_old_metrics(db, keep_days=90)
        return record
    
    def get_biometric_summary(self, date: str) -> str:
        """
        Fetch and summarize biometric data for a user-friendly agent prompt.
        """
        try:
            db = SessionLocal()
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").date()
                record = self.get_or_refresh_daily_summary(db, target_date)
            finally:
                db.close()

            if not record:
                return "Unable to fetch biometric data at this time."

            sleep_duration = record.sleep_duration_hours or 0
            sleep_efficiency = record.sleep_efficiency or 0
            resting_hr = record.resting_heart_rate or "Unknown"
            readiness = record.readiness_score

            readiness_text = f" Readiness: {readiness}." if readiness is not None else ""
            summary = f"Sleep: {sleep_duration:.1f} hours (Efficiency: {sleep_efficiency}%). Resting HR: {resting_hr} bpm.{readiness_text}"
            return summary
        except Exception as e:
            from src.utils.logger import logger
            logger.error(f"Error generating biometric summary: {e}")
            return "Unable to fetch biometric data at this time."
    
    def get_heart_rate_data(self, date: str) -> dict:
        """
        Fetch heart rate data for a specific date.
        
        Args:
            date: Date in YYYY-MM-DD format
            
        Returns:
            dict: Heart rate data from Fitbit API
        """
        if self._is_token_expired():
            self._refresh_token()
        
        headers = {'Authorization': f'Bearer {self.access_token}'}
        response = requests.get(f"{self.BASE_URL}/1/user/-/activities/heart/date/{date}/1d.json", headers=headers)
        
        if response.status_code == 401:
            self._refresh_token()
            headers = {'Authorization': f'Bearer {self.access_token}'}
            response = requests.get(f"{self.BASE_URL}/1/user/-/activities/heart/date/{date}/1d.json", headers=headers)
        
        return response.json()
