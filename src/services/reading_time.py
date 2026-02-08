"""
Service for estimating reading time of documents using heuristics and readability scores.
Based on the formula:
    reading_time_minutes =
        (word_count / wpm) * difficulty_multiplier
      + (images * seconds_per_image + tables * seconds_per_table + formulas * seconds_per_formula) / 60
"""

import pdfplumber
import textstat
from langdetect import detect
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ReadingTimeEstimator:
    """Estimates reading time for documents."""

    # Baseline Words Per Minute for different modes
    WPM_DEEP = 225
    WPM_NORMAL = 275
    WPM_SKIMMING = 450

    # Empirical constants for non-text assets (seconds)
    SEC_PER_IMAGE = 20
    SEC_PER_TABLE = 40
    SEC_PER_FORMULA = 30
    SEC_PER_CODE_BLOCK = 45

    def analyze_document(self, file_path: str) -> Dict[str, Any]:
        """
        Analyzes a PDF document to extract metrics and estimate reading time.
        
        Args:
            file_path: Path to the PDF file.
            
        Returns:
            Dict containing estimation results and metrics.
        """
        try:
            metrics = self._extract_metrics(file_path)
            
            # Detect language (default to 'en' if detection fails or text is short)
            language = 'en'
            if len(metrics['text']) > 50:
                try:
                    language = detect(metrics['text'][:2000])
                except Exception:
                    pass
            
            difficulty_mult = self._calculate_difficulty_multiplier(metrics['text'], language)
            
            estimates = self._estimate_time(metrics, difficulty_mult)
            
            return {
                **estimates,
                "word_count": metrics['word_count'],
                "difficulty_score": self._get_readability_score(metrics['text'], language),
                "language": language,
                "scanned_prob": metrics['scanned_prob'],
                "page_count": metrics.get("page_count", 0),
                "metrics": {
                    "images": metrics['images'],
                    "tables": metrics['tables'],
                    "formulas": metrics['formulas']
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to analyze document {file_path}: {e}")
            # Fallback for errors
            return self._get_fallback_estimates()

    def _extract_metrics(self, file_path: str) -> Dict[str, Any]:
        """Extracts text and asset counts from PDF."""
        text_content = []
        image_count = 0
        table_count = 0
        formula_count = 0
        
        total_pages = 0
        try:
            with pdfplumber.open(file_path) as pdf:
                total_pages = len(pdf.pages)
                
                for page in pdf.pages:
                    # Extract text
                    page_text = page.extract_text() or ""
                    text_content.append(page_text)
                    
                    # Count images
                    # pdfplumber .images attribute
                    image_count += len(page.images)
                    
                    # Count tables
                    # Simple heuristic: find_tables()
                    tables = page.find_tables()
                    table_count += len(tables) if tables else 0
                    
                    # Heuristic for formulas (e.g., LaTeX delimiters or math symbols)
                    # This is a very rough approximation
                    if "$" in page_text or "∑" in page_text or "∫" in page_text:
                        # Count approx 1 formula per occurrence of block math delimiters
                        formula_count += page_text.count("\\[") + page_text.count("$$")
        except Exception as e:
             logger.warning(f"pdfplumber extraction failed (partial?): {e}")

        full_text = "\n".join(text_content)
        word_count = len(full_text.split())
        
        # Scanned PDF detection heuristic
        # If very low words per page (e.g. < 50), likely scanned
        scanned_prob = 0.0
        if total_pages > 0:
            words_per_page = word_count / total_pages
            if words_per_page < 50:
                scanned_prob = 0.9
            elif words_per_page < 100:
                scanned_prob = 0.5
        
        return {
            "text": full_text,
            "word_count": word_count,
            "images": image_count,
            "tables": table_count,
            "formulas": formula_count,
            "scanned_prob": scanned_prob,
            "page_count": total_pages
        }

    def _calculate_difficulty_multiplier(self, text: str, language: str) -> float:
        """Calculates time multiplier based on text complexity."""
        if not language.startswith('en'):
            return 1.0 # Default for non-English
            
        baseline_grade = 8.0
        alpha = 0.05
        
        try:
            fk_grade = textstat.flesch_kincaid_grade(text)
        except Exception:
            fk_grade = baseline_grade
            
        # Formula: 1 + 0.05 * (grade - 8)
        multiplier = 1.0 + alpha * (fk_grade - baseline_grade)
        
        # Clamp between 0.7 (very easy) and 2.0 (very hard)
        return max(0.7, min(2.0, multiplier))

    def _get_readability_score(self, text: str, language: str) -> Optional[float]:
        if not language.startswith('en'):
            return None
        try:
            return textstat.flesch_kincaid_grade(text)
        except:
            return None

    def _estimate_time(self, metrics: Dict[str, Any], multiplier: float) -> Dict[str, int]:
        """Core formula application."""
        
        word_count = metrics['word_count']
        images = metrics['images']
        tables = metrics['tables']
        formulas = metrics['formulas']
        
        # Calculate visual load time (minutes)
        visuals_time_min = (
            images * self.SEC_PER_IMAGE +
            tables * self.SEC_PER_TABLE +
            formulas * self.SEC_PER_FORMULA
        ) / 60.0
        
        def calc_total(wpm, mult):
            text_time = (word_count / wpm) * mult
            return int(text_time + visuals_time_min)

        # Calculate range
        median_time = calc_total(self.WPM_NORMAL, multiplier)
        
        # Low estimate = faster reading speed (High WPM)
        # correction: user formula says wpm_high = wpm * 1.25 for range
        # simpler: just use skimmig vs normal vs deep
        
        # Using variation on WPM as requested
        wpm_fast = self.WPM_NORMAL * 1.25
        wpm_slow = self.WPM_NORMAL * 0.75
        
        min_time = calc_total(wpm_fast, multiplier)
        max_time = calc_total(wpm_slow, multiplier)
        
        return {
            "reading_time_median": median_time,
            "reading_time_min": min_time,
            "reading_time_max": max_time
        }

    def _get_fallback_estimates(self) -> Dict[str, Any]:
        return {
            "reading_time_median": 0,
            "reading_time_min": 0,
            "reading_time_max": 0,
            "word_count": 0,
            "difficulty_score": None,
            "language": None,
            "scanned_prob": 0.0,
            "metrics": {}
        }


reading_time_estimator = ReadingTimeEstimator()
