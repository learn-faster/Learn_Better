
import pytest
from unittest.mock import MagicMock, patch
from src.services.reading_time import ReadingTimeEstimator

def test_calculate_difficulty_multiplier():
    estimator = ReadingTimeEstimator()
    
    # Simple text (grade < 8)
    simple_text = "The cat sat on the mat. It was a good cat."
    mult = estimator._calculate_difficulty_multiplier(simple_text, 'en')
    # fk_grade likely low, so multiplier should be < 1.0 (clamped to 0.7 maybe)
    assert mult <= 1.0
    
    # Complex text (grade > 8)
    complex_text = "The ontological argument necessitates a transcendental deduction of the categories of understanding."
    mult = estimator._calculate_difficulty_multiplier(complex_text, 'en')
    assert mult >= 1.0

def test_estimate_time_calculation():
    estimator = ReadingTimeEstimator()
    
    # 550 words, normal speed 275 wpm -> 2 minutes text time
    # 1 image -> 20 seconds
    # Total = 2m 20s = 2 minutes (int)
    
    metrics = {
        "word_count": 550,
        "images": 1,
        "tables": 0,
        "formulas": 0
    }
    
    estimates = estimator._estimate_time(metrics, multiplier=1.0)
    
    assert estimates['reading_time_median'] == 2
    
    # 275 wpm * 1.25 = 343.75 wpm -> 550/343.75 = 1.6 min + 0.33 min = 1.93 min -> 1 min
    assert estimates['reading_time_min'] == 1
    
    # 275 wpm * 0.75 = 206.25 wpm -> 550/206.25 = 2.66 min + 0.33 min = 2.99 min -> 2 min
    assert estimates['reading_time_max'] == 2 or estimates['reading_time_max'] == 3

@patch('src.services.reading_time.pdfplumber.open')
def test_analyze_document(mock_open):
    # Mock PDF behavior
    mock_pdf = MagicMock()
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "This is a sample text for testing."
    mock_page.images = [1] # 1 image
    mock_page.find_tables.return_value = []
    
    mock_pdf.pages = [mock_page]
    mock_pdf.__enter__.return_value = mock_pdf
    mock_open.return_value = mock_pdf
    
    estimator = ReadingTimeEstimator()
    result = estimator.analyze_document("fake.pdf")
    
    assert result['word_count'] > 0
    assert result['metrics']['images'] == 1
    assert result['reading_time_median'] is not None
