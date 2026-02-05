"""
Spaced Repetition System (SRS) service.
Implements the SM-2 algorithm with optional retention rate adjustment for FSRS-like behavior.
"""
from datetime import datetime, timedelta
from typing import Tuple
import math


class SRSService:
    """
    Spaced Repetition System using the SM-2 algorithm with retention targeting.
    
    The SM-2 algorithm calculates the next review interval based on:
    - Current ease factor (difficulty)
    - Number of successful repetitions
    - User's recall quality rating (0-5)
    
    Additionally, the target_retention parameter allows scaling intervals
    to achieve a desired retention rate (similar to FSRS).
    """
    
    @staticmethod
    def calculate_next_review(
        ease_factor: float,
        interval: int,
        repetitions: int,
        rating: int,
        target_retention: float = 0.9
    ) -> Tuple[float, int, int, datetime]:
        """
        Calculates the next review parameters based on the SM-2 algorithm
        with optional retention rate adjustment.
        
        The algorithm resets progress if the rating is below 3 (forgotten).
        Otherwise, it updates the ease factor and increases the interval.
        
        Retention Adjustment:
        - Higher target_retention (e.g., 0.97) -> shorter intervals, more reviews
        - Lower target_retention (e.g., 0.75) -> longer intervals, fewer reviews
        - The adjustment uses a log-linear scaling factor.
        
        Args:
            ease_factor (float): Current difficulty of the card (starts at 2.5).
            interval (int): Days between the last review and the next scheduled review.
            repetitions (int): Number of consecutive times the card was successfully recalled.
            rating (int): User-reported recall quality (0: blackout, 5: perfect).
            target_retention (float): Desired retention rate (0.7-0.97). Default 0.9.
            
        Returns:
            Tuple[float, int, int, datetime]: A tuple containing:
                - new_ease_factor (float): Adjusted difficulty for future calculations.
                - new_interval (int): Days until the next review.
                - new_repetitions (int): Updated count of successful recalls.
                - next_review_date (datetime): UTC timestamp for the next review.
        """
        # Clamp target_retention to valid range
        target_retention = max(0.7, min(0.97, target_retention))
        
        # Rating < 3 means the card was forgotten - reset
        if rating < 3:
            new_repetitions = 0
            new_interval = 1
            new_ease_factor = max(1.3, ease_factor - 0.2)
        else:
            # Calculate new ease factor
            new_ease_factor = ease_factor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02))
            new_ease_factor = max(1.3, new_ease_factor)
            
            # Calculate base interval using SM-2
            if repetitions == 0:
                base_interval = 1
            elif repetitions == 1:
                base_interval = 6
            else:
                base_interval = round(interval * new_ease_factor)
            
            # Apply retention rate scaling (FSRS-inspired)
            # Formula: scaled_interval = base_interval * (ln(target) / ln(0.9))
            # This scales intervals relative to the default 90% retention
            if target_retention != 0.9 and base_interval > 1:
                retention_factor = math.log(target_retention) / math.log(0.9)
                new_interval = max(1, round(base_interval * retention_factor))
            else:
                new_interval = base_interval
            
            new_repetitions = repetitions + 1
        
        # Calculate next review date
        next_review_date = datetime.utcnow() + timedelta(days=new_interval)
        
        return new_ease_factor, new_interval, new_repetitions, next_review_date

    
    @staticmethod
    def get_rating_label(rating: int) -> str:
        """
        Returns a human-readable description for a given rating.
        
        Args:
            rating (int): Recall quality rating (0-5).
            
        Returns:
            str: Descriptive label for the rating.
        """
        labels = {
            0: "Complete Blackout",
            1: "Incorrect, but familiar",
            2: "Incorrect, but close",
            3: "Correct with difficulty",
            4: "Correct with hesitation",
            5: "Perfect recall"
        }
        return labels.get(rating, "Unknown")
