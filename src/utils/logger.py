import logging
import sys
from typing import Optional

def setup_logger(name: str = "learnfast-core", level: int = logging.INFO) -> logging.Logger:
    """
    Sets up a centralized logger with consistent formatting.
    """
    logger = logging.getLogger(name)
    
    # Only configure if handlers haven't been added yet to avoid duplicate logs
    if not logger.handlers:
        logger.setLevel(level)
        
        # Console Handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        
        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(formatter)
        
        logger.addHandler(console_handler)
        
    return logger

# Create the default logger instance
logger = setup_logger()
